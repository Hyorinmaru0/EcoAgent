// Labeled COCO-format pipeline diagnostic, including explicit abstentions.
// COCO128 overlaps COCO pretraining and is not an independent accuracy test.
import { readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { runTvDetector } from "../server/tv-detection.mjs"
import { assessDeviceDetections } from "../src/components/identification/deviceDetectionPolicy.mjs"

const directory = process.argv[2]
if (!directory) throw new Error("Usage: node scripts/validate-device-pipeline.mjs PATH_TO_COCO128")
const classes = { 62: "television", 63: "laptop", 67: "cell phone" }
const files = (await readdir(join(directory, "images/train2017"))).filter(n => n.endsWith(".jpg")).sort()
const rows = new Array(files.length)
function iou(a, b) {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
  return union > 0 ? intersection / union : 0
}
let next = 0, completed = 0
async function worker() {
  while (next < files.length) {
    const index = next++, file = files[index]
    const labels = await readFile(join(directory, "labels/train2017", file.replace(/\.jpg$/, ".txt")), "utf8").catch(() => "")
    const truth = labels.trim().split(/\r?\n/).filter(Boolean).map(line => line.trim().split(/\s+/).map(Number)).filter(([c]) => classes[c]).map(([c, x, y, w, h]) => ({ className: classes[c], box: [x-w/2, y-h/2, x+w/2, y+h/2] }))
    try {
      const result = await runTvDetector(await readFile(join(directory, "images/train2017", file)), { category: "auto" })
      const assessment = assessDeviceDetections(result.detections)
      const prediction = assessment.status === "accepted" ? assessment.detection : null
      const correct = prediction ? truth.some(t => t.className === prediction.className && iou(t.box, prediction.box) >= 0.5) : false
      rows[index] = { file, truth, assessment, correct, referenceModel: result.referenceModel, warning: result.referenceWarning }
    } catch (error) { rows[index] = { file, truth, error: error.message } }
    completed++
    if (completed % 16 === 0) console.log(`${completed}/${files.length} images evaluated`)
  }
}
await Promise.all([worker(), worker()])
const summary = {
  note: "Diagnostic on COCO training subset; not independent accuracy. Multi-device photos can be deliberately rejected.",
  images: rows.length, errors: rows.filter(r => r.error).length,
  negatives: rows.filter(r => !r.truth.length).length,
  negativesAccepted: rows.filter(r => !r.truth.length && r.assessment?.status === "accepted").length,
  positiveImages: rows.filter(r => r.truth.length).length,
  positiveImagesCorrectlyLocalized: rows.filter(r => r.truth.length && r.correct).length,
  positiveImagesRejected: rows.filter(r => r.truth.length && r.assessment?.status !== "accepted").length,
  positivesAcceptedIncorrectly: rows.filter(r => r.truth.length && r.assessment?.status === "accepted" && !r.correct).length,
  referenceUnavailable: rows.filter(r => r.referenceModel === false).length,
}
await writeFile("reports/combined-pipeline-validation.json", JSON.stringify({ summary, rows }, null, 2))
console.log(JSON.stringify(summary, null, 2))
