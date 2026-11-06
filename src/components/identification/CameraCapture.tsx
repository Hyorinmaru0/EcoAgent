import { useEffect, useRef, useState } from "react"
import { validateDevicePhoto } from "./useTvDetection"
import "./camera-capture.css"

type CameraError = { title: string; message: string }

type CapturedPhoto = { file: File; preview: string }

type Props = {
  open: boolean
  onClose: () => void
  onCapture: (file: File) => void
}

type Status = "starting" | "ready" | "captured" | "error"

const MAX_CAPTURE_EDGE = 1600
const CAPTURE_QUALITY = 0.9

function cameraUnavailableMessage(): CameraError {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      title: "Camera needs a secure connection",
      message:
        "Browsers only allow camera access on HTTPS or localhost. Open the app through https:// or keep using it on localhost, then try again.",
    }
  }
  return {
    title: "Camera not supported",
    message:
      "This browser does not provide camera access. Choose a saved photo, or open the camera app on your phone instead.",
  }
}

function describeCameraError(failure: unknown): CameraError {
  const name = failure instanceof DOMException ? failure.name : ""
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        title: "Camera permission blocked",
        message:
          "Allow camera access in this site's browser settings, then try again. You can also choose a saved photo or open your phone's camera app.",
      }
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        title: "No camera found",
        message:
          "This device does not report an available camera. Choose a saved photo or open your phone's camera app instead.",
      }
    case "NotReadableError":
    case "TrackStartError":
      return {
        title: "Camera is busy",
        message:
          "Another app may be using the camera. Close it and try again, or choose a saved photo instead.",
      }
    case "OverconstrainedError":
      return {
        title: "Camera settings unsupported",
        message:
          "This camera cannot provide the requested preview. Try again, or choose a saved photo instead.",
      }
    default:
      return {
        title: "Camera unavailable",
        message:
          "The camera could not be started. Choose a saved photo or open your phone's camera app instead.",
      }
  }
}

function cameraFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `camera-${stamp}.jpg`
}

export function CameraCapture({ open, onClose, onCapture }: Props) {
  const [status, setStatus] = useState<Status>("starting")
  const [error, setError] = useState<CameraError | null>(null)
  const [fileError, setFileError] = useState("")
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const savedPhotoInput = useRef<HTMLInputElement>(null)
  const deviceCameraInput = useRef<HTMLInputElement>(null)
  const runId = useRef(0)

  function stopStream() {
    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function startCamera() {
    const currentRun = ++runId.current
    stopStream()
    setError(null)
    setFileError("")
    setCaptured(null)
    setStatus("starting")

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error")
      setError(cameraUnavailableMessage())
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      if (currentRun !== runId.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => {
          // Autoplay can be rejected; the stream still renders once the user interacts.
        })
      }
      setStatus("ready")
    } catch (failure) {
      if (currentRun !== runId.current) return
      stopStream()
      setStatus("error")
      setError(describeCameraError(failure))
    }
  }

  function close() {
    runId.current += 1
    stopStream()
    onClose()
  }

  function acceptPhoto(file: File | undefined) {
    if (!file) return false
    const message = validateDevicePhoto(file)
    if (message) {
      setFileError(message)
      return false
    }
    setFileError("")
    onCapture(file)
    runId.current += 1
    stopStream()
    onClose()
    return true
  }

  function captureFrame() {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setStatus("error")
      setError({
        title: "Camera not ready",
        message: "Wait for the camera preview to appear, then press Capture again.",
      })
      return
    }

    const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) {
      setStatus("error")
      setError({
        title: "Photo could not be captured",
        message: "This browser cannot process the camera image. Choose a saved photo instead.",
      })
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const captureRun = runId.current
    const preview = canvas.toDataURL("image/jpeg", 0.82)

    canvas.toBlob(
      (blob) => {
        if (captureRun !== runId.current) return
        if (!blob) {
          setStatus("error")
          setError({
            title: "Photo could not be captured",
            message: "The camera frame could not be saved. Try again or choose a saved photo.",
          })
          return
        }
        const file = new File([blob], cameraFileName(), { type: "image/jpeg", lastModified: Date.now() })
        setCaptured({ file, preview })
        setStatus("captured")
        // Turn the camera off while the user reviews the shot.
        stopStream()
      },
      "image/jpeg",
      CAPTURE_QUALITY,
    )
  }

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void startCamera()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
      if (event.key === "Tab") {
        const controls = [...document.querySelectorAll<HTMLElement>('.camera-dialog button:not(:disabled), .camera-dialog input:not(:disabled)')].filter((element) => element.getClientRects().length > 0)
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      runId.current += 1
      stopStream()
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
      previousFocus?.focus()
    }
    // The camera restarts only when the dialog opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div className="camera-overlay" role="dialog" aria-modal="true" aria-label="Take a device photo">
      <div className="camera-dialog">
        <div className="camera-head">
          <div>
            <h2>Take a device photo</h2>
            <p>
              Point the camera at the TV, phone, or laptop. Choosing “Use photo” uploads it to the detector for automatic analysis.
            </p>
          </div>
          <button type="button" className="camera-close" onClick={close} aria-label="Close camera" autoFocus>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </button>
        </div>

        <div className="camera-stage">
          <video ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" />
          {captured && <img className="camera-captured" src={captured.preview} alt="Captured device" />}
          {status === "starting" && (
            <div className="camera-message" role="status">
              <span className="camera-spinner" aria-hidden="true" />
              Starting the camera…
            </div>
          )}
          {status === "error" && error && (
            <div className="camera-message camera-message-error" role="alert">
              <strong>{error.title}</strong>
              <p>{error.message}</p>
            </div>
          )}
        </div>

        <div className="camera-actions">
          {captured ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => void startCamera()}>
                Retake
              </button>
              <button type="button" className="btn btn-primary" onClick={() => acceptPhoto(captured.file)}>
                Use photo
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={captureFrame} disabled={status !== "ready"}>
                Capture
              </button>
            </>
          )}
        </div>

        <div className="camera-fallbacks">
          <button type="button" className="camera-link" onClick={() => savedPhotoInput.current?.click()}>
            Choose a saved photo
          </button>
          <button type="button" className="camera-link" onClick={() => deviceCameraInput.current?.click()}>
            Open device camera app
          </button>
        </div>
        {fileError && (
          <p className="camera-file-error" role="alert">
            {fileError}
          </p>
        )}

        <input
          ref={savedPhotoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            acceptPhoto(event.target.files?.[0])
            event.target.value = ""
          }}
        />
        <input
          ref={deviceCameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            acceptPhoto(event.target.files?.[0])
            event.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
