import { useEffect, useRef, useState } from "react"
import { assessDeviceDetections, DEVICE_ACCEPTANCE_THRESHOLD } from "./deviceDetectionPolicy.mjs"
import { DAMAGE_ACCEPTANCE_THRESHOLD } from "./damageAssessment.mjs"

export type DeviceDetection = {
  origin?: "damage-assisted" | "reference-detector"
  className: "laptop" | "cell phone" | "television"
  score: number
  box: [number, number, number, number]
  verification?: {
    status: "accepted" | "rejected" | "uncertain"
    label: string | null
    similarity: number | null
    margin: number | null
    method?: string
  }
}

export type DeviceCategory = "TV" | "Mobile Phone" | "Laptop"

export const MIN_DISPLAY_CONFIDENCE = DEVICE_ACCEPTANCE_THRESHOLD
export const MIN_DAMAGE_DISPLAY_CONFIDENCE = DAMAGE_ACCEPTANCE_THRESHOLD

const MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_EDGE = 1600
const JPEG_QUALITY = 0.82

export type TvDetection = {
  className: "damaged_tv"
  score: number
  box: [number, number, number, number]
}

export type DamageDetection = {
  className: string
  score: number
  box: [number, number, number, number]
  deviceBox?: [number, number, number, number]
  deviceClassName?: string
  origin?: string
}

export type VisualDamageEvidence = {
  className: "damaged_phone" | "damaged_laptop" | "damaged_tv"
  status: "indicated" | "uncertain"
  method: "local-clip-visual-comparison"
  similarity: number
  margin: number
  box: [number, number, number, number]
}

export type TvDetectionResult = {
  source: "local-yolo"
  model: "device_detection"
  threshold: number
  image: { width: number; height: number }
  detections: DeviceDetection[]
  tvDetections: TvDetection[]
  damageDetections?: DamageDetection[]
  damageModel?: boolean
  damageInferenceMode?: "verified-device-crops" | "full-image-and-device-crops"
  visualDamageCandidates?: VisualDamageEvidence[]
  referenceModel?: boolean
  referenceWarning?: string
  warning: string
  tvWarning?: string
  damageWarning?: string
}

export function getDetectedCategory(detections: DeviceDetection[]): DeviceCategory | null {
  return assessDeviceDetections(detections).category
}

export function validateDevicePhoto(file: Pick<File, "type" | "size">): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return "Choose a JPG, PNG, or WEBP photo."
  if (!file.size || file.size > MAX_SOURCE_PHOTO_BYTES)
    return "Choose a non-empty photo smaller than 25 MB."
  return null
}

async function decodePhoto(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
      // Fall back to an <img> element for browsers that cannot decode the file this way.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = "async"
    await new Promise<void>((accept, reject) => {
      image.onload = () => accept()
      image.onerror = () => reject(new Error("The photo could not be read. Please select it again."))
      image.src = url
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

function renderPhoto(image: HTMLImageElement | ImageBitmap, maxEdge: number, quality: number) {
  const width = "naturalWidth" in image ? image.naturalWidth : image.width
  const height = "naturalHeight" in image ? image.naturalHeight : image.height
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("The photo could not be processed. Please try another image.")
  // Re-encoding also removes EXIF metadata, including any location information.
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", quality)
}

function dataUrlBytes(dataUrl: string) {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1)
  return Math.ceil(encoded.length * 3 / 4)
}

async function preparePhoto(file: File): Promise<string> {
  const image = await decodePhoto(file)
  try {
    let maxEdge = MAX_IMAGE_EDGE
    let quality = JPEG_QUALITY
    let dataUrl = renderPhoto(image, maxEdge, quality)
    while (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES && maxEdge > 640) {
      maxEdge = Math.round(maxEdge * 0.75)
      quality = Math.max(0.5, quality - 0.1)
      dataUrl = renderPhoto(image, maxEdge, quality)
    }
    if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES)
      throw new Error("The photo is too large to process. Choose a smaller image.")
    return dataUrl
  } finally {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close()
  }
}

function isDetectionResult(value: unknown): value is TvDetectionResult {
  if (!value || typeof value !== "object") return false
  const result = value as Partial<TvDetectionResult>
  const isValidBox = (value: unknown): value is DamageDetection => {
    if (!value || typeof value !== "object") return false
    const detection = value as Record<string, unknown>
    const box = detection.box
    return typeof detection.className === "string" && detection.className.length > 0 &&
      typeof detection.score === "number" &&
      Number.isFinite(detection.score) && detection.score >= 0 && detection.score <= 1 &&
      Array.isArray(box) && box.length === 4 &&
      box.every((n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) &&
      box[0] <= box[2] && box[1] <= box[3]
  }
  const isValidDetection = (value: unknown): value is DeviceDetection | TvDetection => {
    if (!isValidBox(value)) return false
    const className = (value as DamageDetection).className
    return className === "damaged_tv" || ["laptop", "cell phone", "television"].includes(className)
  }
  const damageValid = result.damageDetections === undefined ||
    (Array.isArray(result.damageDetections) && result.damageDetections.every(isValidBox))
  const visualDamageValid = result.visualDamageCandidates === undefined ||
    (Array.isArray(result.visualDamageCandidates) && result.visualDamageCandidates.every(d =>
      d && ["damaged_phone", "damaged_laptop", "damaged_tv"].includes(d.className) && ["indicated", "uncertain"].includes(d.status) &&
      d.method === "local-clip-visual-comparison" && Number.isFinite(d.similarity) && d.similarity >= -1 && d.similarity <= 1 &&
      Number.isFinite(d.margin) && d.margin >= -2 && d.margin <= 2 &&
      isValidBox({ ...d, score: 0 })))
  return result.source === "local-yolo" && result.model === "device_detection" &&
    typeof result.warning === "string" && Array.isArray(result.detections) &&
    result.detections.every(isValidDetection) && Array.isArray(result.tvDetections) &&
    result.tvDetections.every(isValidDetection) && damageValid && visualDamageValid &&
    (result.tvWarning === undefined || typeof result.tvWarning === "string") &&
    (result.damageWarning === undefined || typeof result.damageWarning === "string")
}

export function useTvDetection(file: File | null, category: string) {
  const [resultForPhoto, setResult] = useState<{ file: File; value: TvDetectionResult } | null>(null)
  // Never render a previous photo's boxes against the newly selected image.
  const result = resultForPhoto?.file === file ? resultForPhoto.value : null
  const [error, setError] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const active = useRef<AbortController | null>(null)

  async function runAnalysis(targetFile: File, requestedCategory: string) {
    active.current?.abort()
    setResult(null)
    setError("")
    const invalid = validateDevicePhoto(targetFile)
    if (invalid) { setError(invalid); return false }
    const controller = new AbortController()
    active.current = controller
    setIsAnalyzing(true)
    const timer = setTimeout(() => controller.abort("timeout"), 130_000)
    try {
      const image = await preparePhoto(targetFile)
      if (controller.signal.aborted) return false
      const response = await fetch("/api/tv-detection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, category: requestedCategory }), signal: controller.signal,
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error : "The local photo detector could not analyze this photo. Please try again."
        throw new Error(message)
      }
      if (!isDetectionResult(body)) throw new Error("The photo detector returned an invalid result. Please try again.")
      if (controller.signal.aborted) return false
      setResult({ file: targetFile, value: body })
      return assessDeviceDetections(body.detections, requestedCategory).status === "accepted"
    } catch (failure) {
      if (active.current !== controller) return false
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return false
      setError(controller.signal.reason === "timeout"
        ? "Photo analysis timed out. Try a smaller photo."
        : failure instanceof Error ? failure.message : "Photo analysis failed. Please try again.")
      return false
    } finally {
      clearTimeout(timer)
      if (active.current === controller) setIsAnalyzing(false)
    }
  }

  useEffect(() => {
    active.current?.abort()
    active.current = null
    setResult(null)
    setError("")
    setIsAnalyzing(false)
    if (!file) return
    // Detect automatically after upload. When no category is chosen yet, ask the
    // backend to infer one from the device model before the user confirms it.
    void runAnalysis(file, category || "auto")
    return () => { active.current?.abort() }
    // The category is intentionally read only when a new file is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  async function analyze(requestedCategory = category) {
    if (!file) return true
    return runAnalysis(file, requestedCategory)
  }

  return { analyze, result, error, isAnalyzing }
}
