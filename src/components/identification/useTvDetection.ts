import { useEffect, useRef, useState } from "react"

export type TvDetection = {
  className: "damaged_tv"
  score: number
  box: [number, number, number, number]
}

export type TvDetectionResult = {
  source: "local-yolo"
  model: string
  threshold: number
  image: { width: number; height: number }
  detections: TvDetection[]
  warning: string
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
  return result.source === "local-yolo" && typeof result.warning === "string" &&
    Array.isArray(result.detections) && result.detections.every((detection) =>
      detection.className === "damaged_tv" && Number.isFinite(detection.score) &&
      detection.score >= 0 && detection.score <= 1 &&
      Array.isArray(detection.box) && detection.box.length === 4 &&
      detection.box.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) &&
      detection.box[0] <= detection.box[2] && detection.box[1] <= detection.box[3],
    )
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
  }, [file, category])

  async function analyze() {
    active.current?.abort()
    setResult(null)
    setError("")
    if (category !== "TV" || !file) return true
    const invalid = validateDevicePhoto(file)
    if (invalid) { setError(invalid); return false }
    const controller = new AbortController()
    active.current = controller
    setIsAnalyzing(true)
    const timer = setTimeout(() => controller.abort("timeout"), 100_000)
    try {
      const image = await readPhoto(file)
      if (controller.signal.aborted) return false
      const response = await fetch("/api/tv-detection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }), signal: controller.signal,
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error : "The local TV detector could not analyze this photo. Please try again."
        throw new Error(message)
      }
      if (!isDetectionResult(body)) throw new Error("The TV detector returned an invalid result. Please try again.")
      if (controller.signal.aborted) return false
      setResult(body)
      return true
    } catch (failure) {
      if (active.current !== controller) return false
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return false
      setError(controller.signal.reason === "timeout"
        ? "TV photo analysis timed out. Try a smaller photo."
        : failure instanceof Error ? failure.message : "TV photo analysis failed. Please try again.")
      return true
    } finally {
      clearTimeout(timer)
      if (active.current === controller) setIsAnalyzing(false)
    }
  }

  return { analyze, result, error, isAnalyzing }
}
