import { type TvDetectionResult } from "./useTvDetection"
import { assessDeviceDetections } from "./deviceDetectionPolicy.mjs"
import { assessPhotoDamage } from "./damageAssessment.mjs"
import "./tv-detection.css"

type Props = {
  photo: string | null
  category: string
  result: TvDetectionResult | null
  error: string
  isAnalyzing: boolean
}

export function TvDetectionPanel({ photo, category, result, error, isAnalyzing }: Props) {
  if (isAnalyzing) return <p className="tv-detection-status" role="status">Analyzing your photo with the local practice models…</p>
  if (error) return (
    <div className="tv-detection-error" role="alert">
      <strong>Photo analysis unavailable</strong>
      <p>{error}</p>
      <p>You can still use the guidance based on your entered item details.</p>
    </div>
  )
  if (!result || !photo) return null
  const assessment = assessDeviceDetections(result.detections, category)
  const displayDetection = assessment.status === "accepted" ? assessment.detection : null
  const found = Boolean(displayDetection)
  const damage = assessPhotoDamage(result, category)
  // Only an accepted damage result draws a box; an unconfirmed visual hint is
  // reported as text so the photo is never outlined as damaged.
  const damageBox = damage.status === "damaged" ? damage.detection?.box || damage.visualEvidence?.box : null
  const headings = {
    accepted: "Supported device detected",
    "no-match": "No supported device detected",
    uncertain: "Device could not be identified confidently",
    ambiguous: "Multiple or conflicting device candidates",
    mismatch: "Photo does not match your selected category",
    unverified: "Device identity could not be confirmed",
  }
  return (
    <section className="tv-detection-result" aria-label="Device photo analysis" aria-live="polite">
      <span className="badge badge-blue">{displayDetection
        ? displayDetection.origin === "reference-detector" ? "REFERENCE FALLBACK"
          : displayDetection.origin === "damage-assisted" ? "DAMAGE MODEL + VISUAL CHECK" : "CUSTOM TRAINED MODEL"
        : "PHOTO DETECTION"}</span>
      <h3>{headings[assessment.status]}</h3>
      <p>{assessment.status === "accepted" ? displayDetection?.origin === "reference-detector"
        ? "The broader trained detector identified this supported device and passed its acceptance checks. Model predictions can still be wrong."
        : "The detector and a separate visual check agreed on this device. Model predictions can still be wrong."
        : assessment.status === "unverified" ? "The detector and visual check did not agree clearly enough. No device category has been accepted. Try another clear view showing the screen, ports, keyboard, or other identifying features."
        : assessment.status === "mismatch" ? `The strongest candidate is ${assessment.category}, but you selected ${category}. Review the category suggestion or replace the photo before continuing.`
        : assessment.status === "ambiguous" ? "Photograph one device at a time with a clear background. No category has been accepted."
        : "Only TVs, mobile phones, and laptops are supported. Try a clear photo of one whole device. Other objects and uncertain predictions will not receive device guidance."}</p>
      {assessment.status === "accepted" && <p>Detected category: {assessment.category}.</p>}
      <div className="tv-detection-image">
        <img src={photo} alt={found ? "Uploaded device photo with candidate areas highlighted" : "Uploaded device photo analyzed by the practice detectors"} />
        {displayDetection && (
          <span className="tv-detection-box" aria-hidden="true" style={{
            left: `${displayDetection.box[0] * 100}%`, top: `${displayDetection.box[1] * 100}%`,
            width: `${(displayDetection.box[2] - displayDetection.box[0]) * 100}%`,
            height: `${(displayDetection.box[3] - displayDetection.box[1]) * 100}%`,
          }}><span>{displayDetection.className}</span></span>
        )}
        {damageBox && <span className="tv-detection-box damage-candidate" aria-hidden="true" style={{
          left: `${damageBox[0] * 100}%`, top: `${damageBox[1] * 100}%`,
          width: `${(damageBox[2] - damageBox[0]) * 100}%`,
          height: `${(damageBox[3] - damageBox[1]) * 100}%`,
        }}><span>Possible damage</span></span>}
      </div>
      {displayDetection && <ul className="tv-detection-scores"><li>{displayDetection.className}: {(displayDetection.score * 100).toFixed(1)}% model score</li></ul>}
      {found && <section className={`photo-condition photo-condition-${damage.status}`} aria-label="Photo condition assessment">
        <span className="eyebrow">PHOTO CONDITION CHECK</span>
        <h3>{damage.title}</h3>
        <p>{damage.description}</p>
        {damage.detection && <p>Damage model score: {(damage.detection.score * 100).toFixed(1)}%. The outlined area may cover the whole device rather than the precise damage.</p>}
        {damage.visualEvidence && <p>Source: separate visual comparison of the detected device. It estimates visible damage, not the precise crack locations.</p>}
        <small>Working condition requires an actual functional check. The condition you enter in the form is your observation.</small>
      </section>}
      <p className="tv-detection-limit">{result.warning}</p>
      {result.referenceWarning && <p role="status">{result.referenceWarning}</p>}
    </section>
  )
}
