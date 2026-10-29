import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { loadEnv } from "vite"
import { createTvDetectionMiddleware } from "../server/tv-detection.mjs"

Object.assign(process.env, loadEnv("development", process.cwd(), "TV_DETECTOR_"))
const middleware = createTvDetectionMiddleware()
const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
try {
  const image = await readFile(new URL("../ml/tv_training/dataset/images/val/frame_000161.jpg", import.meta.url))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tv-detection`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: `data:image/jpeg;base64,${image.toString("base64")}` }),
  })
  const result = await response.json()
  assert.equal(response.status, 200, result.error)
  assert.equal(result.source, "local-yolo")
  assert.ok(result.detections.length > 0, "Expected the supplied practice frame to produce a TV candidate")
  for (const detection of result.detections) {
    assert.equal(detection.className, "damaged_tv")
    assert.ok(detection.score >= result.threshold && detection.score <= 1)
    assert.ok(detection.box.every((n) => n >= 0 && n <= 1))
  }
  console.log(JSON.stringify({ status: "PASS", image: "validation frame 000161", detections: result.detections, warning: "Pipeline smoke test only; not independent accuracy validation." }, null, 2))
} finally {
  await new Promise((resolve) => server.close(resolve))
}
