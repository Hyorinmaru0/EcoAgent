import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { after, before, test } from "node:test"
import { createTvDetectionMiddleware, runTvDetector } from "../server/tv-detection.mjs"

const jpeg = Buffer.from([255, 216, 255, 224, 0, 16])
const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`
const match = { className: "damaged_tv", score: 0.85, box: [0.1, 0.1, 0.9, 0.9] }
const prediction = (detections = [match]) => ({
  model: "damaged_tv", source: "local-yolo", threshold: 0.25,
  image: { width: 100, height: 100 }, detections,
})
let server, baseUrl, received, handler, behavior
before(async () => {
  handler = createTvDetectionMiddleware({ detect: async (bytes, options) => {
    received = bytes
    return behavior ? behavior(bytes, options) : prediction()
  } })
  server = createServer((req, res) => handler(req, res, () => { res.writeHead(404); res.end() }))
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})
after(async () => { await new Promise((resolve) => server.close(resolve)) })
const request = (image = photo, extra = {}) => fetch(`${baseUrl}/api/tv-detection`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }), ...extra,
})

test("TV photo API returns local detections, dataset context, and limits", async () => {
  const response = await request()
  assert.equal(response.status, 200)
  assert.deepEqual(received, jpeg)
  const body = await response.json()
  assert.equal(body.source, "local-yolo")
  assert.deepEqual(body.detections, [match])
  assert.equal(body.dataset.trainingImages, 160)
  assert.equal(body.dataset.validationImages, 40)
  assert.equal(body.dataset.independentValidation, false)
  assert.match(body.warning, /whole TV, not individual cracks/)
  assert.match(body.warning, /not damage probabilities/)
  assert.equal(response.headers.get("cache-control"), "no-store")
})

test("zero detections do not become a healthy-TV classification", async () => {
  behavior = async () => prediction([])
  try {
    const body = await (await request()).json()
    assert.deepEqual(body.detections, [])
    assert.match(body.warning, /does not establish.*undamaged or safe/)
    assert.equal("condition" in body, false)
  } finally { behavior = null }
})

test("wrong methods and unrelated routes are handled correctly", async () => {
  const response = await fetch(`${baseUrl}/api/tv-detection`)
  assert.equal(response.status, 405)
  assert.equal(response.headers.get("allow"), "POST")
  assert.equal((await fetch(`${baseUrl}/unrelated`)).status, 404)
})

test("rejects invalid JSON and incorrect request types", async () => {
  assert.equal((await request(photo, { body: "{" })).status, 400)
  assert.equal((await request(photo, { headers: { "Content-Type": "text/plain" } })).status, 415)
})

test("rejects unsupported, missing, malformed, and disguised image data", async () => {
  assert.equal((await request(photo, { body: "{}" })).status, 400)
  for (const image of [null, "", "https://example.com/a.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,!"])
    assert.equal((await request(image)).status, 400, String(image))
})

test("accepts PNG and WEBP image signatures", async () => {
  for (const [type, bytes] of [
    ["png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ["webp", Buffer.from("RIFF1234WEBP1234")],
  ]) assert.equal((await request(`data:image/${type};base64,${bytes.toString("base64")}`)).status, 200)
})

test("rejects uploads above 5 MB before running inference", async () => {
  const large = Buffer.alloc(5 * 1024 * 1024 + 1, 1)
  assert.equal((await request(`data:image/jpeg;base64,${large.toString("base64")}`)).status, 413)
})

test("only runs one CPU detection at a time", async () => {
  let release, started
  const running = new Promise((resolve) => { started = resolve })
  behavior = () => new Promise((resolve) => { release = () => resolve(prediction()); started() })
  const first = request()
  await running
  try { assert.equal((await request()).status, 429) }
  finally { release(); behavior = null; await first }
  assert.equal((await request()).status, 200)
})

test("inference failures do not return internal paths or pretend success", async () => {
  behavior = async () => { throw new Error("private local path") }
  try {
    const response = await request()
    assert.equal(response.status, 500)
    assert.doesNotMatch(JSON.stringify(await response.json()), /private local path/)
  } finally { behavior = null }
  assert.equal((await request()).status, 200)
})

test("missing model returns an actionable setup error", async () => {
  const original = process.env.TV_DETECTOR_WEIGHTS
  process.env.TV_DETECTOR_WEIGHTS = "missing-model-for-test.pt"
  try { await assert.rejects(runTvDetector(jpeg), /trained damaged-TV model is missing/) }
  finally {
    if (original === undefined) delete process.env.TV_DETECTOR_WEIGHTS
    else process.env.TV_DETECTOR_WEIGHTS = original
  }
})

test("copied dataset keeps the 160/40 split and 200 manifest entries", async () => {
  const { readdir } = await import("node:fs/promises")
  for (const [split, count] of [["train", 160], ["val", 40]]) {
    const images = (await readdir(`ml/tv_training/dataset/images/${split}`)).filter((n) => n.endsWith(".jpg"))
    const labels = (await readdir(`ml/tv_training/dataset/labels/${split}`)).filter((n) => n.endsWith(".txt"))
    assert.equal(images.length, count)
    assert.equal(labels.length, count)
    assert.deepEqual(images.map((n) => n.slice(0, -4)).sort(), labels.map((n) => n.slice(0, -4)).sort())
  }
  const manifest = await readFile("ml/tv_training/split_manifest.csv", "utf8")
  assert.equal(manifest.trim().split(/\r?\n/).length - 1, 200)
})
