// Diagnostic on existing validation photos, not independent accuracy validation.
import { readdir, readFile, writeFile } from "node:fs/promises"
import { runTvDetector } from "../server/tv-detection.mjs"
import { assessPhotoDamage } from "../src/components/identification/damageAssessment.mjs"
import { assessDeviceDetections } from "../src/components/identification/deviceDetectionPolicy.mjs"

const directory = "ml/damage_detection/dataset/images/val"
const rows = []
for (const file of (await readdir(directory)).filter(name => name.startsWith("cracked-screen")).sort().slice(0, 20)) {
  const result = await runTvDetector(await readFile(`${directory}/${file}`), { category: "Mobile Phone" })
  const identity = assessDeviceDetections(result.detections, "Mobile Phone")
  const condition = assessPhotoDamage(result, "Mobile Phone")
  rows.push({ file, identity, condition, detections: result.detections, raw: result.damageDetections })
  console.log(JSON.stringify({ file, identity: identity.status, condition: condition.status, origin: identity.detection?.origin || "identity-model" }))
}
await writeFile("reports/phone-damage-pipeline-after.json", JSON.stringify(rows, null, 2))
console.log(JSON.stringify({ total: rows.length, damaged: rows.filter(r => r.condition.status === "damaged").length, blocked: rows.filter(r => r.condition.status === "blocked").length, uncertain: rows.filter(r => r.condition.status === "uncertain").length }))
