import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { after, before, test } from "node:test"
import { createTvDetectionMiddleware, runTvDetector } from "../server/tv-detection.mjs"
import { distanceKmBetween, getFacilityRecommendations, isValidCoordinates } from "../src/components/identification/facilityRecommendations.mjs"
import { readBrowserLocation } from "../src/components/identification/browserLocation.mjs"

const jpeg = Buffer.from([255, 216, 255, 224, 0, 16])
const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`
const collectionLocations = JSON.parse(await readFile(new URL("../data/collection-locations.json", import.meta.url), "utf8"))
const coordinateData = JSON.parse(await readFile(new URL("../data/facility-coordinates.json", import.meta.url), "utf8"))
const mappedLocations = collectionLocations.map((entry) => ({ ...entry, locations: entry.locations.map((location) => ({
  ...location, coordinates: coordinateData.locations[`${entry.municipality}/${location.name}`],
})) }))
const tvMatch = { className: "damaged_tv", score: 0.85, box: [0.1, 0.1, 0.9, 0.9] }
const deviceMatch = { className: "television", score: 0.9, box: [0.1, 0.1, 0.9, 0.9], verification: { status: "accepted", label: "television" } }
const damageMatch = { className: "screen_crack", score: 0.75, box: [0.2, 0.2, 0.6, 0.6] }
const prediction = (detections = [deviceMatch], tvDetections = [tvMatch], damageDetections = [], damageModel = false) => ({
  model: "device_detection", source: "local-yolo", threshold: 0.25,
  image: { width: 100, height: 100 }, detections, tvDetections, damageDetections, damageModel,
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
  assert.equal(body.acceptanceThreshold, 0.7)
  assert.equal(body.assessment.status, "accepted")
  assert.equal(body.photoCondition.status, "damaged")
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

test("automatic category analysis is accepted before the user chooses a category", async () => {
  behavior = async (_bytes, options) => {
    assert.equal(options.category, "auto")
    return prediction([deviceMatch], [], [], false)
  }
  try {
    const response = await request(photo, {}, "auto")
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.detections.map(({ className }) => className), ["television"])
  } finally { behavior = null }
})

test("damage model results pass through with a separate limitation warning", async () => {
  behavior = async () => prediction([deviceMatch], [], [damageMatch], true)
  try {
    const body = await (await request()).json()
    assert.deepEqual(body.damageDetections, [damageMatch])
    assert.equal(body.damageModel, true)
    assert.match(body.damageWarning, /not a diagnosis/)
  } finally { behavior = null }
})

test("without a damage model, no damage warning is added", async () => {
  const body = await (await request()).json()
  assert.deepEqual(body.damageDetections, [])
  assert.equal("damageWarning" in body, false)
})

test("zero detections do not become a healthy-TV classification", async () => {
  behavior = async () => prediction([], [])
  try {
    const body = await (await request()).json()
    assert.deepEqual(body.detections, [])
    assert.equal(body.assessment.status, "no-match")
    assert.equal(body.photoCondition.status, "blocked")
    assert.equal(body.assessment.category, null)
    assert.deepEqual(body.tvDetections, [])
    assert.match(body.tvWarning, /does not establish.*undamaged or safe/)
    assert.equal("condition" in body, false)
  } finally { behavior = null }
})

test("high-confidence wallet false positive is not accepted as a phone by the API", async () => {
  behavior = async () => prediction([{
    className: "cell phone", score: 0.937, box: [0.2, 0.2, 0.6, 0.7],
    verification: { status: "rejected", label: "wallet", similarity: 0.31, margin: 0.001 },
  }], [])
  try {
    const response = await request(photo, {}, "Mobile Phone")
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.assessment.status, "unverified")
    assert.equal(body.assessment.category, null)
    assert.equal(body.assessment.detection, null)
  } finally { behavior = null }
})

test("separate visual phone damage evidence is exposed without fabricating YOLO damage scores", async () => {
  behavior = async () => ({ ...prediction([{ ...deviceMatch, className: "cell phone", verification: { status: "accepted", label: "cell phone" } }], [], [], true),
    visualDamageCandidates: [{ className: "damaged_phone", status: "indicated", method: "local-clip-visual-comparison", similarity: 0.34, margin: 0.03, box: [0.1, 0.1, 0.9, 0.9] }],
  })
  try {
    const response = await request(photo, {}, "Mobile Phone")
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.photoCondition.status, "uncertain")
    assert.equal(body.photoCondition.source, "visual-comparison")
    assert.equal(body.photoCondition.detection, null)
    assert.equal(body.photoCondition.visualEvidence.similarity, 0.34)
    assert.deepEqual(body.damageDetections, [])
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

test("facility recommendations match the device and change order with the user's coordinates", () => {
  const northEdsa = coordinateData.locations["Quezon City/SM North EDSA"]
  const mallOfAsia = coordinateData.locations["Pasay/SM Mall of Asia"]
  const laptopOptions = getFacilityRecommendations(mappedLocations, "Laptop", northEdsa)
  assert.ok(laptopOptions.length > 0)
  assert.equal(laptopOptions[0].name, "SM North EDSA")
  assert.equal(laptopOptions[0].distanceKm, 0)
  assert.ok(laptopOptions.every((facility) => /laptop/i.test(facility.acceptanceLabel)))
  const distances = laptopOptions.filter((facility) => facility.distanceKm !== null).map((facility) => facility.distanceKm)
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b))
  const movedOptions = getFacilityRecommendations(mappedLocations, "Laptop", mallOfAsia)
  assert.equal(movedOptions[0].name, "SM Mall of Asia")
  assert.ok(movedOptions.some((facility) => facility.name === "SM North EDSA"))
})

test("without location permission, listings have no distance or invented nearest facility", () => {
  const options = getFacilityRecommendations(mappedLocations, "Mobile Phone")
  assert.ok(options.length > 0)
  assert.ok(options.every((facility) => facility.distanceKm === null))
  assert.ok(options.some((facility) => facility.name === "SM North EDSA"))
})

test("potential device acceptance is labeled for confirmation and unsupported items do not match", () => {
  const options = getFacilityRecommendations(mappedLocations, "TV")
  const scheduledTv = options.find((facility) => facility.name === "UP Diliman Electrical and Electronics Engineering Institute")
  assert.ok(scheduledTv)
  assert.match(scheduledTv.acceptanceLabel, /confirm/i)
  assert.deepEqual(getFacilityRecommendations(mappedLocations, "Tablet"), [])
})

test("distance outranks city boundaries and acceptance certainty; unmapped venues sort last", () => {
  const sample = [
    { municipality: "City A", locations: [
      { name: "Farther listed venue", acceptedDevices: "Laptops", status: "Listed", coordinates: { latitude: 0, longitude: 0.2 } },
      { name: "Unmapped venue", acceptedDevices: "Laptops", status: "Listed" },
    ] },
    { municipality: "City B", locations: [
      { name: "Closer potential venue", acceptedDevices: "Electronics", status: "Confirm laptop acceptance", coordinates: { latitude: 0, longitude: 0.01 } },
      { name: "Phone-only venue", acceptedDevices: "Mobile phones", status: "Listed", coordinates: { latitude: 0, longitude: 0 } },
    ] },
  ]
  const results = getFacilityRecommendations(sample, "Laptop", { latitude: 0, longitude: 0 })
  assert.deepEqual(results.map((facility) => facility.name), ["Closer potential venue", "Farther listed venue", "Unmapped venue"])
  assert.equal(results[2].distanceKm, null)
  assert.match(results[0].acceptanceLabel, /Potential.*confirm/)
})

test("distance calculation handles identical, equatorial, invalid, and antipodal coordinates", () => {
  const origin = { latitude: 0, longitude: 0 }
  assert.equal(distanceKmBetween(origin, origin), 0)
  assert.ok(Math.abs(distanceKmBetween(origin, { latitude: 0, longitude: 1 }) - 111.195) < 0.001)
  assert.ok(Number.isFinite(distanceKmBetween(origin, { latitude: 0, longitude: 180 })))
  for (const invalid of [null, undefined, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: NaN }, { latitude: 0, longitude: 181 }]) {
    assert.equal(isValidCoordinates(invalid), false)
    assert.equal(distanceKmBetween(origin, invalid), null)
  }
})

test("mapped coordinates belong to directory records and retain a source for every pin", () => {
  const keys = new Set(collectionLocations.flatMap((entry) => entry.locations.map((location) => `${entry.municipality}/${location.name}`)))
  for (const [key, point] of Object.entries(coordinateData.locations)) {
    assert.ok(keys.has(key), key)
    assert.ok(isValidCoordinates(point), key)
    assert.match(point.source, /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/)
  }
})

test("browser location requests ask for a fresh high-accuracy reading", async () => {
  const coords = { latitude: 14.65, longitude: 121.03, accuracy: 25 }
  let options
  const result = await readBrowserLocation({ getCurrentPosition(success, _failure, settings) { options = settings; success({ coords }) } }, true)
  assert.deepEqual(result, { ...coords, source: "device" })
  assert.equal(options.enableHighAccuracy, true)
  assert.equal(options.maximumAge, 0)
  assert.equal(options.timeout, 45000)
})

test("browser location errors cover permission denial, timeout, unavailable GPS, and invalid coordinates", async () => {
  for (const [code, message] of [[1, /denied.*site settings/], [2, /could not be found/], [3, /timed out/]]) {
    await assert.rejects(readBrowserLocation({ getCurrentPosition(_success, fail) { fail({ code }) } }, true), message)
  }
  await assert.rejects(readBrowserLocation(null, true), /does not provide device location/)
  await assert.rejects(readBrowserLocation({ getCurrentPosition() { throw new Error("Should not request GPS") } }, false), /HTTPS or localhost/)
  await assert.rejects(readBrowserLocation({ getCurrentPosition(success) { success({ coords: { latitude: NaN, longitude: 121 } }) } }, true), /invalid location/)
})

test("nearest facility renders a pinned map and directions, while denied location renders a useful fallback", async () => {
  const { createElement } = await import("react")
  const { renderToStaticMarkup } = await import("react-dom/server")
  const { createServer: createViteServer } = await import("vite")
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "custom" })
  try {
    const { NearestFacilityPanel } = await vite.ssrLoadModule("/src/components/identification/NearestFacilityPanel.tsx")
    const position = { ...coordinateData.locations["Quezon City/SM North EDSA"], accuracy: 10 }
    const props = { category: "Laptop", recommendations: getFacilityRecommendations(mappedLocations, "Laptop", position), position, status: "ready", error: "", onLocate() {}, locationChoices: [], onApproximateLocation() {}, onDirectory() {} }
    const ready = renderToStaticMarkup(createElement(NearestFacilityPanel, props))
    assert.match(ready, /Map showing your location and the nearest e-waste facility/)
    assert.match(ready, /Loading map/)
    assert.match(ready, /google\.com\/maps\/dir\/\?/)
    assert.match(ready, /straight.line/)
    const denied = renderToStaticMarkup(createElement(NearestFacilityPanel, { ...props, position: null, recommendations: getFacilityRecommendations(mappedLocations, "Laptop"), status: "error", error: "Location access was denied." }))
    assert.match(denied, /Location access was denied/)
    assert.match(denied, /Use my location/)
    assert.match(denied, /Browse full directory/)
    assert.doesNotMatch(denied, /<iframe/)
  } finally { await vite.close() }
})
