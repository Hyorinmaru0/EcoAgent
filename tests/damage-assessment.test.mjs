import assert from "node:assert/strict"
import { test } from "node:test"
import { assessPhotoDamage } from "../src/components/identification/damageAssessment.mjs"
const device = { className: "cell phone", score: 0.95, box: [0.2, 0.2, 0.8, 0.8], verification: { status: "accepted", label: "cell phone" } }
const damage = { className: "damaged_phone", score: 0.8, box: [0.3, 0.3, 0.7, 0.7] }
const result = (detections = [damage]) => ({ detections: [device], damageModel: true, damageDetections: detections, tvDetections: [] })
const visual = { className: "damaged_phone", status: "indicated", method: "local-clip-visual-comparison", similarity: 0.34, margin: 0.03, box: [0.2, 0.2, 0.8, 0.8] }

test("weak visual-only evidence can never flag damage on its own", () => {
  const assessment = assessPhotoDamage({ ...result([]), visualDamageCandidates: [visual] }, "Mobile Phone")
  assert.equal(assessment.status, "uncertain")
  assert.equal(assessment.source, "visual-comparison")
  assert.equal(assessment.detection, null, "Do not fabricate a YOLO damage box or score")
  assert.equal(assessment.visualEvidence, visual)
})
test("unmistakable visual-only evidence can still flag a shattered phone missed by the detector", () => {
  const strong = { ...visual, similarity: 0.55, margin: 0.12 }
  const assessment = assessPhotoDamage({ ...result([]), visualDamageCandidates: [strong] }, "Mobile Phone")
  assert.equal(assessment.status, "damaged")
  assert.equal(assessment.source, "visual-comparison")
  assert.equal(assessment.detection, null, "Do not fabricate a YOLO damage box or score")
  assert.equal(assessment.visualEvidence, strong)
})
test("weak, malformed, or out-of-device visual evidence cannot become damage", () => {
  for (const patch of [{ similarity: 0.29 }, { margin: 0.005 }, { status: "uncertain" }, { box: [0, 0, 0.1, 0.1] }, { similarity: NaN }, { method: "unknown" }]) {
    const assessment = assessPhotoDamage({ ...result([]), visualDamageCandidates: [{ ...visual, ...patch }] }, "Mobile Phone")
    assert.equal(assessment.status, "uncertain")
  }
})
test("visual damage evidence never bypasses wallet rejection or a category mismatch", () => {
  const data = { ...result([]), visualDamageCandidates: [visual] }
  assert.equal(assessPhotoDamage(data, "Laptop").status, "blocked")
  assert.equal(assessPhotoDamage({ ...data, detections: [{ ...device, verification: { status: "rejected", label: "wallet" } }] }, "Mobile Phone").status, "blocked")
})
test("matching, overlapping damage produces a possible damaged/broken result", () => {
  const assessment = assessPhotoDamage(result(), "Mobile Phone")
  assert.equal(assessment.status, "damaged")
  assert.equal(assessment.detection.className, "damaged_phone")
})

test("a presence result from another device crop cannot mark the selected device as damaged", () => {
  const broad = { ...damage, box: [0, 0, 1, 1], deviceBox: [0.01, 0.01, 0.15, 0.15] }
  assert.equal(assessPhotoDamage(result([broad]), "Mobile Phone").status, "uncertain")
  // Matching provenance is not enough: a box covering the whole photo localizes nothing.
  assert.equal(assessPhotoDamage(result([{ ...broad, deviceBox: device.box }]), "Mobile Phone").status, "uncertain")
  assert.equal(assessPhotoDamage(result([{ ...broad, deviceBox: [0,0,1,NaN] }]), "Mobile Phone").status, "uncertain")
  // A normal-sized box on the accepted device is still accepted.
  assert.equal(assessPhotoDamage(result([{ ...damage, deviceBox: device.box }]), "Mobile Phone").status, "damaged")
})

test("laptop and TV damage claims need the independent visual comparison when it is available", () => {
  const laptop = { ...device, className: "laptop", verification: { status: "accepted", label: "laptop" } }
  const claim = { ...damage, className: "damaged_laptop" }
  const base = { detections: [laptop], damageModel: true, damageDetections: [claim], tvDetections: [] }
  assert.equal(assessPhotoDamage(base, "Laptop").status, "damaged")
  const evidence = { className: "damaged_laptop", status: "uncertain", method: "local-clip-visual-comparison", similarity: 0.29, margin: 0.002, box: [0.2, 0.2, 0.8, 0.8] }
  const contradicted = assessPhotoDamage({ ...base, visualDamageCandidates: [evidence] }, "Laptop")
  assert.equal(contradicted.status, "uncertain")
  assert.equal(contradicted.detection, null)
  assert.equal(contradicted.visualEvidence, evidence)
  assert.equal(assessPhotoDamage({ ...base, visualDamageCandidates: [{ ...evidence, status: "indicated", similarity: 0.42, margin: 0.08 }] }, "Laptop").status, "damaged")
  // Evidence for another device or outside the device box never corroborates.
  assert.equal(assessPhotoDamage({ ...base, visualDamageCandidates: [{ ...evidence, className: "damaged_tv" }] }, "Laptop").status, "damaged")
  assert.equal(assessPhotoDamage({ ...base, visualDamageCandidates: [{ ...evidence, box: [0, 0, 0.1, 0.1] }] }, "Laptop").status, "damaged")
})

test("binary damage requires an accepted identity, matching device scope, and crop provenance", () => {
  const generic = { ...damage, className: "visible_damage", origin: "device-crop", deviceClassName: "cell phone", deviceBox: device.box }
  const data = { ...result([generic]), damageInferenceMode: "verified-device-crops" }
  assert.equal(assessPhotoDamage(data, "Mobile Phone").status, "damaged")
  for (const patch of [{deviceClassName:"laptop"}, {origin:"whole-photo"}, {deviceBox:undefined}])
    assert.equal(assessPhotoDamage({...data,damageDetections:[{...generic,...patch}]}, "Mobile Phone").status, "uncertain")
  assert.equal(assessPhotoDamage({...data,damageInferenceMode:undefined}, "Mobile Phone").status, "uncertain")
  assert.equal(assessPhotoDamage({...result(),damageInferenceMode:"verified-device-crops"}, "Mobile Phone").status, "uncertain")
})

test("a configured crop model does not inherit condition claims from the old single-TV practice model", () => {
  const tv = { ...device, className: "television", verification: { status: "accepted", label: "television" } }
  const data = { detections:[tv],damageModel:true,damageInferenceMode:"verified-device-crops",damageDetections:[],tvDetections:[{...damage,className:"damaged_tv"}] }
  assert.equal(assessPhotoDamage(data,"TV").status,"uncertain")
})
test("no detections never becomes a working or undamaged claim", () => {
  const assessment = assessPhotoDamage(result([]), "Mobile Phone")
  assert.equal(assessment.status, "uncertain")
  assert.match(assessment.description, /not confirmation.*working/)
})
test("wrong device classes, background damage, weak scores, and invalid boxes are excluded", () => {
  for (const candidate of [
    { ...damage, className: "damaged_laptop" }, { ...damage, score: 0.08 },
    { ...damage, box: [0, 0, 0.1, 0.1] }, { ...damage, box: [0.5, 0.5, 0.5, 0.6] },
    { ...damage, score: NaN }, { ...damage, box: [0, 0, 2, 2] },
  ]) assert.equal(assessPhotoDamage(result([candidate]), "Mobile Phone").status, "uncertain")
})
test("wallets and mismatched categories cannot receive a damage assessment", () => {
  const wallet = { ...device, verification: { status: "rejected", label: "wallet" } }
  assert.equal(assessPhotoDamage({ ...result(), detections: [wallet] }, "Mobile Phone").status, "blocked")
  assert.equal(assessPhotoDamage(result(), "Laptop").status, "blocked")
})
test("automatic identity-only inference and missing models do not become no-damage results", () => {
  assert.equal(assessPhotoDamage({ ...result([]), damageModel: false }, "Mobile Phone").status, "not-run")
})
test("TV practice evidence is used only for an accepted TV and must overlap", () => {
  const tv = { ...device, className: "television", verification: { status: "accepted", label: "television" } }
  const data = { detections: [tv], damageModel: false, tvWarning: "Practice TV model", tvDetections: [{ ...damage, className: "damaged_tv" }] }
  assert.equal(assessPhotoDamage(data, "TV").status, "damaged")
  assert.equal(assessPhotoDamage({ ...data, tvDetections: [] }, "TV").status, "uncertain")
})

test("weak matching damage is reported as uncertain with its actual score, never promoted to damage", () => {
  const assessment = assessPhotoDamage(result([{ ...damage, score: 0.37 }]), "Mobile Phone")
  assert.equal(assessment.status, "uncertain")
  assert.equal(assessment.detection, null)
  assert.match(assessment.description, /37.0%/)
})

test("damage must clear a high acceptance threshold before it is reported", () => {
  assert.equal(assessPhotoDamage(result([{ ...damage, score: 0.69 }]), "Mobile Phone").status, "uncertain")
  assert.equal(assessPhotoDamage(result([{ ...damage, score: 0.7 }]), "Mobile Phone").status, "damaged")
})

test("the single-recording TV practice model needs stronger evidence than the crop damage model", () => {
  const tv = { ...device, className: "television", verification: { status: "accepted", label: "television" } }
  const data = { detections: [tv], damageModel: false, tvWarning: "Practice TV model", tvDetections: [{ ...damage, className: "damaged_tv" }] }
  assert.equal(assessPhotoDamage({ ...data, tvDetections: [{ ...damage, className: "damaged_tv", score: 0.75 }] }, "TV").status, "uncertain")
  assert.equal(assessPhotoDamage({ ...data, tvDetections: [{ ...damage, className: "damaged_tv", score: 0.85 }] }, "TV").status, "damaged")
})
