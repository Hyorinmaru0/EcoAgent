import assert from "node:assert/strict"
import { test } from "node:test"
import { assessDeviceDetections } from "../src/components/identification/deviceDetectionPolicy.mjs"
const candidate = (className, score, box = [0.1, 0.1, 0.9, 0.9]) => ({ className, score, box, verification: { status: "accepted", label: className } })

test("corroborated reference model recovers a custom model's incorrect phone candidate", () => {
  const wrong = { ...candidate("cell phone", 0.9), verification: { status: "rejected", label: "keyboard" } }
  const reference = { ...candidate("laptop", 0.69), origin: "reference-detector" }
  assert.equal(assessDeviceDetections([wrong, reference], "Laptop").status, "accepted")
  assert.equal(assessDeviceDetections([wrong, reference]).category, "Laptop")
})

test("confirmed custom training output remains primary even if reference has a higher score", () => {
  const custom = candidate("cell phone", 0.82)
  const reference = { ...candidate("cell phone", 0.98), origin: "reference-detector" }
  assert.equal(assessDeviceDetections([custom, reference], "Mobile Phone").detection, custom)
})
test("reference below threshold and unverified phone predictions cannot bypass rejection", () => {
  const reference = { ...candidate("cell phone", 0.95), origin: "reference-detector", verification: { status: "rejected", label: "wallet" } }
  assert.equal(assessDeviceDetections([reference]).category, null)
  assert.equal(assessDeviceDetections([{ ...candidate("laptop", 0.59), origin: "reference-detector" }]).category, null)
})
test("conflicting accepted models and a mismatched selected category remain blocked", () => {
  const reference = { ...candidate("laptop", 0.9), origin: "reference-detector" }
  assert.equal(assessDeviceDetections([reference], "TV").status, "mismatch")
  assert.equal(assessDeviceDetections([reference, candidate("cell phone", 0.9)]).status, "ambiguous")
})

test("a visually verified damaged-phone proposal can recover a missed identity", () => {
  const recovered = { ...candidate("cell phone", 0.93), origin: "damage-assisted" }
  for (const primary of [[], [candidate("television", 0.47)], [{ ...candidate("laptop", 0.95), verification: { status: "rejected", label: "cell phone" } }]]) {
    assert.equal(assessDeviceDetections([...primary, recovered], "Mobile Phone").status, "accepted")
  }
})
test("recovery cannot bypass verification or override a verified primary identity", () => {
  const recovery = { ...candidate("cell phone", 0.99), origin: "damage-assisted" }
  assert.equal(assessDeviceDetections([candidate("laptop", 0.85), recovery], "Mobile Phone").status, "mismatch")
  assert.equal(assessDeviceDetections([{ ...recovery, verification: { status: "rejected", label: "wallet" } }]).category, null)
  assert.equal(assessDeviceDetections([{ ...recovery, score: 0.6 }]).category, null)
})

test("a 93.7% phone prediction rejected as a wallet never becomes accepted", () => {
  const wallet = { ...candidate("cell phone", 0.937), verification: { status: "rejected", label: "wallet" } }
  assert.equal(assessDeviceDetections([wallet], "Mobile Phone").status, "unverified")
  assert.equal(assessDeviceDetections([wallet]).category, null)
})
test("missing, uncertain, or contradictory verification fails closed at high detector confidence", () => {
  for (const verification of [undefined, { status: "uncertain", label: "cell phone" }, { status: "accepted", label: "wallet" }]) {
    assert.equal(assessDeviceDetections([{ ...candidate("cell phone", 0.99), verification }]).status, "unverified")
  }
})
test("unknown objects, empty results, malformed boxes and low scores are never accepted", () => {
  for (const detections of [[], [candidate("bottle", 0.99)], [candidate("laptop", 0.69)],
    [candidate("cell phone", NaN)], [candidate("television", 1.1)],
    [candidate("cell phone", 0.99, [0.5, 0.5, 0.5, 0.7])]]) {
    const result = assessDeviceDetections(detections)
    assert.notEqual(result.status, "accepted")
    assert.equal(result.category, null)
    assert.equal(result.detection, null)
  }
})
test("all three supported classes can be accepted without a selected category", () => {
  for (const [name, category] of [["laptop", "Laptop"], ["cell phone", "Mobile Phone"], ["television", "TV"]]) {
    assert.equal(assessDeviceDetections([candidate(name, 0.9)]).category, category)
    assert.equal(assessDeviceDetections([candidate(name, 0.9)], category).status, "accepted")
  }
})
test("selected category cannot override stronger evidence from a different class", () => {
  const result = assessDeviceDetections([candidate("cell phone", 0.4), candidate("laptop", 0.95)], "Mobile Phone")
  assert.equal(result.status, "mismatch")
  assert.equal(result.category, "Laptop")
})
test("conflicting classes and photos with multiple supported types require another photo", () => {
  for (const detections of [[candidate("laptop", 0.72), candidate("television", 0.64)],
    [candidate("laptop", 0.98), candidate("cell phone", 0.75)]]) {
    assert.equal(assessDeviceDetections(detections).status, "ambiguous")
    assert.equal(assessDeviceDetections(detections).category, null)
  }
})
test("multiple detections of one class do not create a class conflict", () => {
  assert.equal(assessDeviceDetections([candidate("laptop", 0.9), candidate("laptop", 0.8)]).status, "accepted")
})
