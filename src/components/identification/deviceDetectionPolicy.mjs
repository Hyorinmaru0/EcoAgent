// Acceptance policy shared by the API and photo UI. Scores are not probabilities.
export const DEVICE_ACCEPTANCE_THRESHOLD = 0.7
export const DEVICE_AMBIGUITY_MARGIN = 0.15
export const REFERENCE_ACCEPTANCE_THRESHOLD = 0.6
const categories = { television: "TV", "cell phone": "Mobile Phone", laptop: "Laptop" }

export function assessDeviceDetections(detections, requestedCategory = "auto") {
  const all = Array.isArray(detections) ? detections : []
  // Preserve the project's custom trained model as the primary source. Only
  // use corroborated reference predictions when the custom path cannot confirm.
  const reference = assessCandidates(all.filter(d => d?.origin === "reference-detector" && d.verification?.status === "accepted"), requestedCategory, REFERENCE_ACCEPTANCE_THRESHOLD)
  const primary = assessCandidates(all.filter(d => !["damage-assisted", "reference-detector"].includes(d?.origin)), requestedCategory)
  if (reference.category && primary.category && reference.category !== primary.category)
    return { status: "ambiguous", category: null, detection: null }
  // Keep scores from different models separate. Recovery never overrides an
  // accepted identity, a category mismatch, or an ambiguous multi-device photo.
  if (["accepted", "mismatch", "ambiguous"].includes(primary.status)) return primary
  if (["accepted", "mismatch", "ambiguous"].includes(reference.status)) return reference
  const recovery = assessCandidates(all.filter(d => d?.origin === "damage-assisted"), requestedCategory)
  return ["accepted", "mismatch", "ambiguous"].includes(recovery.status) ? recovery : primary
}

function assessCandidates(detections, requestedCategory, threshold = DEVICE_ACCEPTANCE_THRESHOLD) {
  const candidates = (Array.isArray(detections) ? detections : []).filter(d =>
    d && Object.hasOwn(categories, d.className) && Number.isFinite(d.score) &&
    d.score >= 0 && d.score <= 1 && Array.isArray(d.box) && d.box.length === 4 &&
    d.box.every(n => Number.isFinite(n) && n >= 0 && n <= 1) &&
    d.box[0] < d.box[2] && d.box[1] < d.box[3],
  ).sort((a, b) => b.score - a.score)
  const best = candidates[0]
  if (!best || best.score < threshold)
    return { status: best ? "uncertain" : "no-match", category: null, detection: null }
  // Never cherry-pick a weaker prediction just because it matches the form.
  const competing = candidates.find(d => d.className !== best.className)
  if (competing && (competing.score >= threshold ||
    best.score - competing.score < DEVICE_AMBIGUITY_MARGIN))
    return { status: "ambiguous", category: null, detection: null }
  // Fail closed for old responses and verifier outages, even at 99% YOLO score.
  if (best.verification?.status !== "accepted" || best.verification.label !== best.className)
    return { status: "unverified", category: null, detection: null }
  const category = categories[best.className]
  if (requestedCategory && requestedCategory !== "auto" && requestedCategory !== category)
    return { status: "mismatch", category, detection: best }
  return { status: "accepted", category, detection: best }
}
