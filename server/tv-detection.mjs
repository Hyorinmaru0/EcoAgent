import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { assessDeviceDetections, DEVICE_ACCEPTANCE_THRESHOLD, REFERENCE_ACCEPTANCE_THRESHOLD } from "../src/components/identification/deviceDetectionPolicy.mjs"
import { assessPhotoDamage } from "../src/components/identification/damageAssessment.mjs"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const maxImageBytes = 5 * 1024 * 1024
const maxBodyBytes = Math.ceil(maxImageBytes / 3) * 4 + 1024
const warning = "Practice model: 200 frames from one TV recording. Boxes locate the whole TV, not individual cracks. Model scores are not damage probabilities. No detection does not establish that a TV is undamaged or safe."

class DetectionError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sendJson(res, status, body) {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
  res.end(JSON.stringify(body))
}

function readJson(req) {
  return new Promise((accept, reject) => {
    let size = 0
    let oversized = false
    const chunks = []
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > maxBodyBytes) {
        if (!oversized) reject(new DetectionError(413, "Choose an image smaller than 5 MB."))
        oversized = true
        chunks.length = 0
      } else if (!oversized) chunks.push(chunk)
    })
    req.on("end", () => {
      if (oversized) return
      try { accept(JSON.parse(Buffer.concat(chunks).toString("utf8"))) }
      catch { reject(new DetectionError(400, "Send a valid JSON image request.")) }
    })
    req.on("error", reject)
    req.on("aborted", () => reject(new DetectionError(400, "The upload was cancelled.")))
  })
}

function decodeImage(body) {
  const match = typeof body?.image === "string"
    ? body.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
    : null
  if (!match || match[2].length % 4 !== 0)
    throw new DetectionError(400, "Choose a JPG, PNG, or WEBP photo.")
  const image = Buffer.from(match[2], "base64")
  if (image.length > maxImageBytes)
    throw new DetectionError(413, "Choose an image smaller than 5 MB.")
  const validSignature = match[1] === "jpeg"
    ? image.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : match[1] === "png"
      ? image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP"
  if (!validSignature) throw new DetectionError(400, "The photo contents do not match its image type.")
  return image
}

function detectorConfig() {
  const localPython = resolve(projectRoot, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python")
  return {
    python: process.env.TV_DETECTOR_PYTHON || (existsSync(localPython) ? localPython : "python"),
    deviceWeights: resolve(projectRoot, process.env.DEVICE_DETECTOR_WEIGHTS || "ml/device_detection/weights/best.pt"),
    tvWeights: resolve(projectRoot, process.env.TV_DETECTOR_WEIGHTS || "ml/tv_training/weights/best.pt"),
    damageWeights: resolve(projectRoot, process.env.DAMAGE_DETECTOR_WEIGHTS || "ml/damage_detection/weights/best.pt"),
    referenceWeights: resolve(projectRoot, process.env.REFERENCE_DETECTOR_WEIGHTS || "ml/device_detection/reference/yolo11m.onnx"),
  }
}

function usableWeights(path) {
  if (existsSync(path)) return path
  const onnx = path.replace(/\.pt$/i, ".onnx")
  return existsSync(onnx) ? onnx : path
}

export function runTvDetector(image, { signal, category = "TV" } = {}) {
  const { python, deviceWeights, tvWeights, damageWeights, referenceWeights } = detectorConfig()
  const devicePath = usableWeights(deviceWeights)
  const tvPath = usableWeights(tvWeights)
  const damagePath = usableWeights(damageWeights)
  if (!existsSync(devicePath)) return Promise.reject(new DetectionError(503, "The trained device detection model is missing."))
  if (category === "TV" && !existsSync(tvPath))
    return Promise.reject(new DetectionError(503, "The trained damaged-TV model is missing."))
  if (!["vision_model_quantized.onnx", "labels.npz"].every(name => existsSync(resolve(projectRoot, "ml/device_detection/verifier", name))))
    return Promise.reject(new DetectionError(503, "The local visual verifier is missing. Run scripts/setup-device-verifier.py with the detector Python environment."))
  return new Promise((accept, reject) => {
    const args = [resolve(projectRoot, "ml/tv_training/infer.py"), "--device-weights", devicePath]
    if (existsSync(referenceWeights)) args.push("--reference-weights", referenceWeights)
    if (category === "TV") args.push("--tv-weights", tvPath)
    // Damaged phones can be missed by the identity model, so include damage
    // proposals during upload too. Each proposal still requires visual verification.
    if (existsSync(damagePath)) args.push("--damage-weights", damagePath)
    const child = spawn(python, args, {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", YOLO_CONFIG_DIR: resolve(projectRoot, "ml/tv_training/.ultralytics") },
    })
    let output = ""
    let finished = false
    function finish(error, result) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      if (error) { child.kill(); reject(error) }
      else accept(result)
    }
    const abort = () => finish(new DetectionError(499, "The photo analysis was cancelled."))
    const timer = setTimeout(() => finish(new DetectionError(504, "Photo analysis timed out. Try a smaller photo.")), 120_000)
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
      if (output.length > 128 * 1024) finish(new DetectionError(502, "The detector returned too much output."))
    })
    child.stderr.resume()
    child.stdin.on("error", () => {})
    child.on("error", () => finish(new DetectionError(503, "The detector Python environment is unavailable. Check TV_DETECTOR_PYTHON.")))
    child.on("close", (code) => {
      try {
        const result = JSON.parse(output)
        if (code !== 0 || result.error)
          finish(new DetectionError(result.status === 400 ? 400 : 503, result.error || "The TV detector could not run."))
        else if (result.source !== "local-yolo" || !Array.isArray(result.detections) || !Array.isArray(result.tvDetections) ||
          (result.damageDetections !== undefined && !Array.isArray(result.damageDetections)))
          finish(new DetectionError(502, "The detector returned an invalid result."))
        else finish(null, result)
      } catch { finish(new DetectionError(503, "The detector could not start. Check its Python dependencies.")) }
    })
    child.stdin.end(image)
  })
}

// Dependency injection lets API tests exercise uploads without loading a model.
export function createTvDetectionMiddleware({ detect = runTvDetector } = {}) {
  let busy = false
  return function tvDetectionMiddleware(req, res, next) {
    const path = (req.url || "").split("?")[0]
    if (path !== "/api/tv-detection") { next(); return }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST")
      sendJson(res, 405, { error: "Use POST to analyze a TV photo." })
      return
    }
    const controller = new AbortController()
    const cancel = () => { if (!res.writableEnded) controller.abort() }
    res.on("close", cancel)
    ;(async () => {
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
        throw new DetectionError(415, "Send the photo as an application/json request.")
      const body = await readJson(req)
      const category = body?.category ?? "TV"
      if (!["TV", "Mobile Phone", "Laptop", "auto"].includes(category))
        throw new DetectionError(400, "Choose TV, Mobile Phone, or Laptop as the item category.")
      const image = decodeImage(body)
      if (busy) throw new DetectionError(429, "Another TV photo is being analyzed. Please try again shortly.")
      busy = true
      try {
        const result = await detect(image, { signal: controller.signal, category })
        sendJson(res, 200, {
          ...result,
          acceptanceThreshold: DEVICE_ACCEPTANCE_THRESHOLD,
          acceptanceThresholds: { custom: DEVICE_ACCEPTANCE_THRESHOLD, reference: REFERENCE_ACCEPTANCE_THRESHOLD },
          assessment: assessDeviceDetections(result.detections, category),
          photoCondition: assessPhotoDamage({ ...result, ...(category === "TV" ? { tvWarning: warning } : {}) }, category),
          warning: "Device detections are practice-model results, not proof of item identity, condition, safety, or value.",
          ...(category === "TV" ? { tvWarning: warning } : {}),
          ...(result.damageModel ? { damageWarning: result.damageInferenceMode === "verified-device-crops"
            ? "Damage scores assess each verified device crop. They do not localize individual cracks or establish whether the device works."
            : "Laptop candidates cover the full photo crop, which may include background. These practice-model results are not a diagnosis, severity rating, repair estimate, or safety assessment." } : {}),
          ...(category === "TV" ? { dataset: { trainingImages: 160, validationImages: 40, independentValidation: false } } : {}),
        })
      } finally { busy = false }
    })().catch((error) => {
      sendJson(res, error instanceof DetectionError ? error.status : 500, {
        error: error instanceof DetectionError ? error.message : "Photo analysis could not finish. Try again.",
      })
    }).finally(() => res.removeListener("close", cancel))
  }
}
