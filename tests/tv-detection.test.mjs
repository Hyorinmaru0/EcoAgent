import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { after, before, test } from "node:test"
import { createTvDetectionMiddleware, runTvDetector } from "../server/tv-detection.mjs"
import { getFacilityRecommendations } from "../src/components/identification/facilityRecommendations.mjs"

const jpeg = Buffer.from([255, 216, 255, 224, 0, 16])
const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`
const collectionLocations = JSON.parse(await readFile(new URL("../data/collection-locations.json", import.meta.url), "utf8"))
const tvMatch = { className: "damaged_tv", score: 0.85, box: [0.1, 0.1, 0.9, 0.9] }
const deviceMatch = { className: "television", score: 0.9, box: [0.1, 0.1, 0.9, 0.9] }
const prediction = (detections = [deviceMatch], tvDetections = [tvMatch]) => ({
  model: "device_detection", source: "local-yolo", threshold: 0.25,
  image: { width: 100, height: 100 }, detections, tvDetections,
})
let server, baseUrl, received, detectedCategory, handler, behavior
before(async () => {
  handler = createTvDetectionMiddleware({ detect: async (bytes, options) => {
    received = bytes
    detectedCategory = options.category
    return behavior ? behavior(bytes, options) : prediction()
  } })
  server = createServer((req, res) => handler(req, res, () => { res.writeHead(404); res.end() }))
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})
after(async () => { await new Promise((resolve) => server.close(resolve)) })
const request = (image = photo, extra = {}, category = "TV") => fetch(`${baseUrl}/api/tv-detection`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image, category }), ...extra,
})

test("TV photo API returns both model predictions, dataset context, and limits", async () => {
  const response = await request()
  assert.equal(response.status, 200)
  assert.deepEqual(received, jpeg)
  assert.equal(detectedCategory, "TV")
  const body = await response.json()
  assert.equal(body.source, "local-yolo")
  assert.equal(body.model, "device_detection")
  assert.deepEqual(body.detections, [deviceMatch])
  assert.deepEqual(body.tvDetections, [tvMatch])
  assert.equal(body.dataset.trainingImages, 160)
  assert.equal(body.dataset.validationImages, 40)
  assert.equal(body.dataset.independentValidation, false)
  assert.match(body.warning, /not proof of item identity/)
  assert.match(body.tvWarning, /whole TV, not individual cracks/)
  assert.match(body.tvWarning, /not damage probabilities/)
  assert.equal(response.headers.get("cache-control"), "no-store")
})

test("phone and laptop analysis uses the device model without running TV-specific inference", async () => {
  behavior = async (_bytes, options) => {
    assert.equal(options.category, "Mobile Phone")
    return prediction([{ className: "cell phone", score: 0.8, box: [0.2, 0.2, 0.6, 0.7] }], [])
  }
  try {
    const response = await request(photo, {}, "Mobile Phone")
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.detections.map(({ className }) => className), ["cell phone"])
    assert.deepEqual(body.tvDetections, [])
    assert.equal("tvWarning" in body, false)
    assert.equal("dataset" in body, false)
  } finally { behavior = null }
})

test("zero detections do not become a healthy-TV classification", async () => {
  behavior = async () => prediction([], [])
  try {
    const body = await (await request()).json()
    assert.deepEqual(body.detections, [])
    assert.deepEqual(body.tvDetections, [])
    assert.match(body.tvWarning, /does not establish.*undamaged or safe/)
    assert.equal("condition" in body, false)
  } finally { behavior = null }
})

test("rejects unsupported item categories", async () => {
  const response = await request(photo, {}, "tablet")
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /TV, Mobile Phone, or Laptop/)
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

test("missing device model returns an actionable setup error", async () => {
  const original = process.env.DEVICE_DETECTOR_WEIGHTS
  process.env.DEVICE_DETECTOR_WEIGHTS = "missing-device-model-for-test.pt"
  try { await assert.rejects(runTvDetector(jpeg), /trained device detection model is missing/) }
  finally {
    if (original === undefined) delete process.env.DEVICE_DETECTOR_WEIGHTS
    else process.env.DEVICE_DETECTOR_WEIGHTS = original
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

test("facility recommendations match the selected device and prioritize the requested municipality", () => {
  const laptopOptions = getFacilityRecommendations(collectionLocations, "Laptop", "Quezon City")
  assert.ok(laptopOptions.length > 0)
  assert.ok(laptopOptions.every((facility) => facility.isLocal))
  assert.ok(laptopOptions.every((facility) => /laptop/i.test(facility.acceptanceLabel)))
  assert.ok(laptopOptions.some((facility) => facility.name === "SM North EDSA"))

  const tvOptions = getFacilityRecommendations(collectionLocations, "TV", "Caloocan")
  assert.ok(tvOptions.some((facility) => facility.name === "Bagong Silang TSD Facility"))
  assert.ok(tvOptions.every((facility) => facility.isLocal))
})

test("when no local match exists, facility recommendations show matching options elsewhere", () => {
  const options = getFacilityRecommendations(collectionLocations, "Mobile Phone", "Navotas")
  assert.ok(options.length > 0)
  assert.ok(options.every((facility) => !facility.isLocal))
  assert.ok(options.some((facility) => facility.name === "SM North EDSA"))
})

test("potential device acceptance is labeled for confirmation and unsupported items do not match", () => {
  const options = getFacilityRecommendations(collectionLocations, "TV", "Quezon City")
  const scheduledTv = options.find((facility) => facility.name === "UP Diliman Electrical and Electronics Engineering Institute")
  assert.ok(scheduledTv)
  assert.match(scheduledTv.acceptanceLabel, /confirm/i)
  assert.deepEqual(getFacilityRecommendations(collectionLocations, "Tablet", "Quezon City"), [])
})
