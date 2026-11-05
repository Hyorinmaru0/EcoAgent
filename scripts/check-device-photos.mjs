// Run actual trained weights, then the exact acceptance policy used by the UI.
// Optional manifest: [{ path: "relative/to/manifest.jpg", expected: null | "TV" | "Mobile Phone" | "Laptop" }]
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { loadEnv } from "vite"
import { runTvDetector } from "../server/tv-detection.mjs"
import { assessDeviceDetections } from "../src/components/identification/deviceDetectionPolicy.mjs"

Object.assign(process.env, loadEnv("development", process.cwd(), ["TV_DETECTOR_", "DEVICE_DETECTOR_"]))
const manifestPath = process.argv[2] && resolve(process.argv[2])
const cases = manifestPath ? JSON.parse(await readFile(manifestPath, "utf8")) : [
  { url: "https://raw.githubusercontent.com/ultralytics/yolov5/master/data/images/bus.jpg", expected: null },
  { url: "https://raw.githubusercontent.com/ultralytics/yolov5/master/data/images/zidane.jpg", expected: null },
  { path: "ml/tv_training/dataset/images/val/frame_000161.jpg", expected: "TV" },
]
assert.ok(Array.isArray(cases) && cases.length > 0, "Manifest must contain photo cases")
let failed = 0
for (const entry of cases) {
  assert.ok([null, "TV", "Mobile Phone", "Laptop"].includes(entry.expected), "Set the expected category or null for unsupported photos")
  let bytes
  if (entry.url) {
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(30_000) })
    assert.ok(response.ok, `Could not fetch ${entry.url}`)
    bytes = Buffer.from(await response.arrayBuffer())
  } else bytes = await readFile(resolve(manifestPath ? dirname(manifestPath) : process.cwd(), entry.path))
  const result = await runTvDetector(bytes, { category: "auto" })
  const assessment = assessDeviceDetections(result.detections)
  const actual = assessment.status === "accepted" ? assessment.category : null
  const pass = actual === entry.expected
  if (!pass) failed++
  console.log(JSON.stringify({ photo: entry.path || entry.url, expected: entry.expected, actual, status: assessment.status, pass, detections: result.detections }))
}
console.log(`${cases.length - failed}/${cases.length} photo checks passed. This sample does not establish general accuracy.`)
process.exitCode = failed ? 1 : 0
