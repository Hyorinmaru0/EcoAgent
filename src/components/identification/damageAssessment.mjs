import { assessDeviceDetections } from "./deviceDetectionPolicy.mjs"

export const DAMAGE_ACCEPTANCE_THRESHOLD = 0.7
// The TV condition model was fit on a single recording, so a mid-range score
// from it is far weaker evidence than the crop-level damage detector.
const TV_PRACTICE_MODEL_THRESHOLD = 0.8
// CLIP visual comparison is uncalibrated zero-shot evidence. Below these
// margins it can only raise "uncertain", never flag damage on its own.
const VISUAL_ONLY_MIN_SIMILARITY = 0.45
const VISUAL_ONLY_MIN_MARGIN = 0.05
const damageClasses = { TV: "damaged_tv", "Mobile Phone": "damaged_phone", Laptop: "damaged_laptop" }
// A damage box this large covers the whole photo instead of a damaged area.
const MAX_DAMAGE_BOX_FRACTION = 0.9

function boxArea(box) {
  return (box[2] - box[0]) * (box[3] - box[1])
}

function overlapsDevice(box, device) {
  const [x1, y1, x2, y2] = box, [dx1, dy1, dx2, dy2] = device
  if (x1 >= x2 || y1 >= y2) return false
  const intersection = Math.max(0, Math.min(x2, dx2) - Math.max(x1, dx1)) * Math.max(0, Math.min(y2, dy2) - Math.max(y1, dy1))
  return intersection / Math.min(boxArea(box), boxArea(device)) >= 0.5
}

// The independent CLIP condition check for an accepted laptop or TV crop.
function deviceConditionEvidence(result, category, device) {
  return (result.visualDamageCandidates || []).find(e =>
    e.method === "local-clip-visual-comparison" && e.className === damageClasses[category] &&
    (e.status === "indicated" || e.status === "uncertain") &&
    Number.isFinite(e.similarity) && e.similarity >= 0 && e.similarity <= 1 &&
    Number.isFinite(e.margin) && e.margin >= -1 && e.margin <= 2 &&
    Array.isArray(e.box) && e.box.length === 4 && e.box.every(n => Number.isFinite(n) && n >= 0 && n <= 1) &&
    overlapsDevice(e.box, device.box)) || null
}

export function assessPhotoDamage(result, category) {
  const base = { detection: null, source: null, visualEvidence: null }
  const identity = assessDeviceDetections(result?.detections, category)
  if (!result || identity.status !== "accepted")
    return { ...base, status: "blocked", title: "Condition not assessed", description: "Identify a supported device before assessing visible damage." }
  const device = identity.detection
  const acceptedCategory = identity.category
  const candidates = [
    ...(result.damageModel ? (result.damageDetections || []).map(d => ({ ...d, source: "damage-model" })) : []),
    ...(acceptedCategory === "TV" && result.damageInferenceMode !== "verified-device-crops" ? (result.tvDetections || []).map(d => ({ ...d, source: "tv-model" })) : []),
  ].filter(d => {
    if (result.damageInferenceMode === "verified-device-crops" &&
        (d.origin !== "device-crop" || !Array.isArray(d.deviceBox))) return false
    const matchingClass = d.className === damageClasses[acceptedCategory] ||
      (d.className === "visible_damage" && result.damageInferenceMode === "verified-device-crops" &&
       d.origin === "device-crop" && d.deviceClassName === device.className && Array.isArray(d.deviceBox))
    if (!matchingClass || !Number.isFinite(d.score) || d.score < 0.08 || d.score > 1 ||
      !Array.isArray(d.box) || d.box.length !== 4 || !d.box.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return false
    const [x1, y1, x2, y2] = d.box
    if (x1 >= x2 || y1 >= y2) return false
    const [dx1, dy1, dx2, dy2] = device.box
    if (d.deviceBox) {
      if (!Array.isArray(d.deviceBox) || d.deviceBox.length !== 4 || !d.deviceBox.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return false
      const [cx1, cy1, cx2, cy2] = d.deviceBox
      const shared = Math.max(0, Math.min(cx2, dx2) - Math.max(cx1, dx1)) * Math.max(0, Math.min(cy2, dy2) - Math.max(cy1, dy1))
      const union = (cx2 - cx1) * (cy2 - cy1) + (dx2 - dx1) * (dy2 - dy1) - shared
      if (cx1 >= cx2 || cy1 >= cy2 || !(union > 0) || shared / union < 0.5) return false
    }
    const intersection = Math.max(0, Math.min(x2, dx2) - Math.max(x1, dx1)) * Math.max(0, Math.min(y2, dy2) - Math.max(y1, dy1))
    const smallerArea = Math.min((x2 - x1) * (y2 - y1), (dx2 - dx1) * (dy2 - dy1))
    return intersection / smallerArea >= 0.5
  }).sort((a, b) => b.score - a.score)
  const strongest = candidates[0]
  const acceptanceThreshold = strongest?.source === "tv-model" ? TV_PRACTICE_MODEL_THRESHOLD : DAMAGE_ACCEPTANCE_THRESHOLD
  // A box covering nearly the whole photo localizes no damaged part.
  const localizesDamage = Boolean(strongest) && !(strongest.source === "damage-model" && boxArea(strongest.box) >= MAX_DAMAGE_BOX_FRACTION)
  if (strongest && strongest.score >= acceptanceThreshold && localizesDamage) {
    const { source, ...detection } = strongest
    // Phones keep the crop model alone; laptop and TV claims additionally need
    // the independent visual comparison when that evidence is available.
    const conditionEvidence = acceptedCategory === "Mobile Phone" ? null : deviceConditionEvidence(result, acceptedCategory, device)
    if (acceptedCategory === "Mobile Phone" || !conditionEvidence || conditionEvidence.status === "indicated")
      return { ...base, status: "damaged", title: "Possible damaged / broken device", description: "The model found a damage candidate on this device. It cannot distinguish cosmetic damage from a non-working device or determine the specific fault.", detection, source }
    return { ...base, status: "uncertain", source, visualEvidence: conditionEvidence,
      title: "Damage could not be confirmed",
      description: `The damage model found a candidate scoring ${(strongest.score * 100).toFixed(1)}%, but the independent visual comparison does not show visible damage on this ${acceptedCategory}. The result is uncertain; damage may still be present. Try a sharp close-up of the damaged area.` }
  }
  const visualEvidence = acceptedCategory === "Mobile Phone" && (result.visualDamageCandidates || []).find(e => {
    if (e.status !== "indicated" || e.method !== "local-clip-visual-comparison" || e.className !== "damaged_phone" ||
      !Number.isFinite(e.similarity) || e.similarity < 0.30 || e.similarity > 1 || !Number.isFinite(e.margin) || e.margin < 0.01 || e.margin > 2 ||
      !Array.isArray(e.box) || e.box.length !== 4 || !e.box.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return false
    const [x1, y1, x2, y2] = e.box, [dx1, dy1, dx2, dy2] = device.box
    if (x1 >= x2 || y1 >= y2) return false
    const overlap = Math.max(0, Math.min(x2, dx2) - Math.max(x1, dx1)) * Math.max(0, Math.min(y2, dy2) - Math.max(y1, dy1))
    return overlap / Math.min((x2 - x1) * (y2 - y1), (dx2 - dx1) * (dy2 - dy1)) >= 0.5
  })
  if (visualEvidence) {
    const convincing = visualEvidence.similarity >= VISUAL_ONLY_MIN_SIMILARITY && visualEvidence.margin >= VISUAL_ONLY_MIN_MARGIN
    if (convincing) return { ...base, status: "damaged", source: "visual-comparison", visualEvidence,
      title: "Possible damaged / broken device", description: "A separate visual comparison strongly indicates visible screen damage. The specialized damage detector did not confirm it. This is a visual estimate and cannot establish whether the phone works." }
    return { ...base, status: "uncertain", source: "visual-comparison", visualEvidence,
      title: "Damage could not be confirmed", description: "A separate visual comparison leans toward visible screen damage, but not strongly enough to confirm it and the specialized damage detector did not agree. This is a visual estimate, not confirmation that the phone is damaged or working. Try a sharp close-up of the damaged area." }
  }
  if (strongest && !localizesDamage)
    return { ...base, status: "uncertain", title: "Damage could not be confirmed",
      description: `The damage candidate covers ${Math.round(boxArea(strongest.box) * 100)}% of the whole photo, so it does not point at a damaged part of the device. This is an inconclusive result, not confirmation that the device is undamaged or working. Try a close-up of the damaged area.` }
  if (!result.damageModel && !(acceptedCategory === "TV" && typeof result.tvWarning === "string"))
    return { ...base, status: "not-run", title: "Damage assessment not available yet", description: "Select the matching category and analyze the photo to run the available damage model." }
  return { ...base, status: "uncertain", title: "Damage could not be confirmed", description: candidates.length
    ? `A matching damage candidate scored ${(candidates[0].score * 100).toFixed(1)}%, below the acceptance threshold. The result is uncertain; damage may still be present. Try a sharp close-up with the damaged area clearly visible.`
    : "The model did not find reliable damage evidence on this device. This is an inconclusive result, not confirmation that the device is undamaged or working. Try another clear view of the damaged area." }
}
