import { getDetectedCategory, MIN_DISPLAY_CONFIDENCE, type TvDetectionResult } from "./useTvDetection"
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
  const deviceDetections = result.detections.filter((detection) => detection.score >= MIN_DISPLAY_CONFIDENCE)
  const tvDetections = result.tvDetections.filter((detection) => detection.score >= MIN_DISPLAY_CONFIDENCE)
  const found = deviceDetections.length > 0 || tvDetections.length > 0
  const detectedCategory = getDetectedCategory(deviceDetections)
  return (
    <section className="tv-detection-result" aria-label="Device photo analysis" aria-live="polite">
      <span className="badge badge-blue">PRACTICE PHOTO DETECTORS</span>
      <h3>{found ? "Possible device matches" : "No device matches detected"}</h3>
      <p>{found
        ? "The models found possible device candidates. Review the highlighted areas below."
        : "Neither model found a candidate above its detection threshold. This does not establish the item's identity, condition, or safety."}</p>
      {detectedCategory && <p>{category === detectedCategory
        ? `Selected category set to ${detectedCategory} from the highest-confidence device match.`
        : `Highest-confidence device match suggests ${detectedCategory}; selected category remains ${category}.`}</p>}
      <div className="tv-detection-image">
        <img src={photo} alt={found ? "Uploaded device photo with candidate areas highlighted" : "Uploaded device photo analyzed by the practice detectors"} />
        {deviceDetections.map((detection, index) => (
          <span key={`device-${index}`} className="tv-detection-box" aria-hidden="true" style={{
            left: `${detection.box[0] * 100}%`, top: `${detection.box[1] * 100}%`,
            width: `${(detection.box[2] - detection.box[0]) * 100}%`,
            height: `${(detection.box[3] - detection.box[1]) * 100}%`,
          }}><span>{detection.className}</span></span>
        ))}
        {tvDetections.map((detection, index) => (
          <span key={`tv-${index}`} className="tv-detection-box tv-detection-box-specialist" aria-hidden="true" style={{
            left: `${detection.box[0] * 100}%`, top: `${detection.box[1] * 100}%`,
            width: `${(detection.box[2] - detection.box[0]) * 100}%`,
            height: `${(detection.box[3] - detection.box[1]) * 100}%`,
          }}><span>TV model match</span></span>
        ))}
      </div>
      {found && <ul className="tv-detection-scores">{deviceDetections.map((detection, index) => (
        <li key={`device-${index}`}>{detection.className}: {(detection.score * 100).toFixed(1)}% model score</li>
      ))}{tvDetections.map((detection, index) => (
        <li key={`tv-${index}`}>TV-specific model match: {(detection.score * 100).toFixed(1)}% model score</li>
      ))}</ul>}
      <p className="tv-detection-limit">{result.warning}</p>
      {result.tvWarning && <p className="tv-detection-limit">{result.tvWarning}</p>}
    </section>
  )
}
