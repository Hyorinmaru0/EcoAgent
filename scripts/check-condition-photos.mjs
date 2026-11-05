import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runTvDetector } from '../server/tv-detection.mjs'
import { assessDeviceDetections } from '../src/components/identification/deviceDetectionPolicy.mjs'
import { assessPhotoDamage } from '../src/components/identification/damageAssessment.mjs'

const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'))
const cases = []
for (const entry of manifest) {
  try {
    const result = await runTvDetector(await readFile(resolve(entry.path)), { category: entry.requestCategory || 'auto' })
    const identity = assessDeviceDetections(result.detections)
    const damage = assessPhotoDamage(result, identity.category || '')
    const pass = (entry.expectedCategory === undefined || identity.category === entry.expectedCategory) &&
      (damage.status === 'damaged') === entry.expectedDamaged &&
      (!entry.expectedSource || damage.source === entry.expectedSource)
    const row = { ...entry, actualCategory: identity.category, identityStatus: identity.status,
      damageStatus: damage.status, damageSource: damage.source, damageDetections: result.damageDetections,
      score: damage.detection?.score ?? null, pass }
    cases.push(row)
    console.log(JSON.stringify(row))
  } catch (error) { cases.push({ ...entry, pass: false, error: String(error) }) }
}
const report = { weights: process.env.DAMAGE_DETECTOR_WEIGHTS || 'original default',
  passed: cases.filter(row => row.pass).length, total: cases.length,
  blocked: cases.filter(row => row.identityStatus !== 'accepted').length, cases }
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2))
console.log(JSON.stringify({ passed: report.passed, total: report.total, blocked: report.blocked }))
process.exitCode = report.passed === report.total ? 0 : 1
