import type { TvDetectionResult } from "./useTvDetection"
import "./tv-detection.css"

type Props = {
  photo: string | null
  result: TvDetectionResult | null
  error: string
  isAnalyzing: boolean
}

export function TvDetectionPanel({ photo, result, error, isAnalyzing }: Props) {
  if (isAnalyzing) return <p className="tv-detection-status" role="status">Analyzing your TV photo with the local practice model…</p>
  if (error) return (
    <div className="tv-detection-error" role="alert">
      <strong>Photo analysis unavailable</strong>
      <p>{error}</p>
      <p>You can still use the guidance based on your entered item details.</p>
    </div>
  )
  if (!result || !photo) return null
  const found = result.detections.length > 0
  return (
    <section className="tv-detection-result" aria-label="TV photo analysis" aria-live="polite">
      <span className="badge badge-blue">PRACTICE PHOTO DETECTOR</span>
      <h3>{found ? "Possible damaged-TV match" : "No damaged-TV match detected"}</h3>
      <p>{found
        ? "The photo contains a TV candidate resembling the labeled training examples. Review the highlighted area below."
        : "The model found no candidate above its detection threshold. This does not confirm that the TV is intact or safe."}</p>
      <div className="tv-detection-image">
        <img src={photo} alt={found ? "Uploaded TV photo with candidate areas highlighted" : "Uploaded TV photo analyzed by the practice detector"} />
        {result.detections.map((detection, index) => (
          <span key={index} className="tv-detection-box" aria-hidden="true" style={{
            left: `${detection.box[0] * 100}%`, top: `${detection.box[1] * 100}%`,
            width: `${(detection.box[2] - detection.box[0]) * 100}%`,
            height: `${(detection.box[3] - detection.box[1]) * 100}%`,
          }}><span>TV {index + 1}</span></span>
        ))}
      </div>
      {found && <ul className="tv-detection-scores">{result.detections.map((detection, index) => (
        <li key={index}>TV {index + 1}: {(detection.score * 100).toFixed(1)}% model score</li>
      ))}</ul>}
      <p className="tv-detection-limit">{result.warning}</p>
    </section>
  )
}
