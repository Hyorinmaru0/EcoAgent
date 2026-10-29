import { useEffect, useRef, useState } from "react"

export type DeviceDetection = {
  className: "laptop" | "cell phone" | "television"
  score: number
  box: [number, number, number, number]
}

export type DeviceCategory = "TV" | "Mobile Phone" | "Laptop"

export const MIN_DISPLAY_CONFIDENCE = 0.5

export type TvDetection = {
  className: "damaged_tv"
  score: number
  box: [number, number, number, number]
}

export type TvDetectionResult = {
  source: "local-yolo"
  model: "device_detection"
  threshold: number
  image: { width: number; height: number }
  detections: DeviceDetection[]
  tvDetections: TvDetection[]
  warning: string
  tvWarning?: string
}

export function getDetectedCategory(detections: DeviceDetection[]): DeviceCategory | null {
  const strongest = detections.reduce<DeviceDetection | null>(
    (best, detection) => detection.score >= MIN_DISPLAY_CONFIDENCE &&
      (!best || detection.score > best.score) ? detection : best,
    null,
  )
  if (!strongest) return null
  if (strongest.className === "television") return "TV"
  if (strongest.className === "cell phone") return "Mobile Phone"
  return "Laptop"
}

export function validateDevicePhoto(file: Pick<File, "type" | "size">): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return "Choose a JPG, PNG, or WEBP photo."
  if (!file.size || file.size > 5 * 1024 * 1024)
    return "Choose a non-empty photo smaller than 5 MB."
  return null
}

function readPhoto(file: File): Promise<string> {
  return new Promise((accept, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === "string"
      ? accept(reader.result) : reject(new Error("The photo could not be read."))
    reader.onerror = () => reject(new Error("The photo could not be read. Please select it again."))
    reader.readAsDataURL(file)
  })
}

function isDetectionResult(value: unknown): value is TvDetectionResult {
  if (!value || typeof value !== "object") return false
  const result = value as Partial<TvDetectionResult>
  const isValidDetection = (value: unknown): value is DeviceDetection | TvDetection => {
    if (!value || typeof value !== "object") return false
    const detection = value as Record<string, unknown>
    const validClass = detection.className === "damaged_tv" ||
      ["laptop", "cell phone", "television"].includes(String(detection.className))
    const box = detection.box
    return validClass && typeof detection.score === "number" &&
      Number.isFinite(detection.score) && detection.score >= 0 && detection.score <= 1 &&
      Array.isArray(box) && box.length === 4 &&
      box.every((n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) &&
      box[0] <= box[2] && box[1] <= box[3]
  }
  return result.source === "local-yolo" && result.model === "device_detection" &&
    typeof result.warning === "string" && Array.isArray(result.detections) &&
    result.detections.every(isValidDetection) && Array.isArray(result.tvDetections) &&
    result.tvDetections.every(isValidDetection) &&
    (result.tvWarning === undefined || typeof result.tvWarning === "string")
}

export function useTvDetection(file: File | null, category: string) {
  const [result, setResult] = useState<TvDetectionResult | null>(null)
  const [error, setError] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const active = useRef<AbortController | null>(null)

  useEffect(() => {
    active.current?.abort()
    active.current = null
    setResult(null)
    setError("")
    setIsAnalyzing(false)
    return () => { active.current?.abort() }
  }, [file])

  async function analyze() {
    active.current?.abort()
    setResult(null)
    setError("")
    if (!file) return true
    const invalid = validateDevicePhoto(file)
    if (invalid) { setError(invalid); return false }
    const controller = new AbortController()
    active.current = controller
    setIsAnalyzing(true)
    const timer = setTimeout(() => controller.abort("timeout"), 130_000)
    try {
      const image = await readPhoto(file)
      if (controller.signal.aborted) return false
      const response = await fetch("/api/tv-detection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, category }), signal: controller.signal,
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error : "The local photo detector could not analyze this photo. Please try again."
        throw new Error(message)
      }
      if (!isDetectionResult(body)) throw new Error("The photo detector returned an invalid result. Please try again.")
      if (controller.signal.aborted) return false
      setResult(body)
      return true
    } catch (failure) {
      if (active.current !== controller) return false
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return false
      setError(controller.signal.reason === "timeout"
        ? "Photo analysis timed out. Try a smaller photo."
        : failure instanceof Error ? failure.message : "Photo analysis failed. Please try again.")
      return true
    } finally {
      clearTimeout(timer)
      if (active.current === controller) setIsAnalyzing(false)
    }
  }

  return { analyze, result, error, isAnalyzing }
}
