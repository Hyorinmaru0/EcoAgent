import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

const root = resolve('ml/condition_training/sources/round2')
const manifest = []
const pausedHosts = new Set()
await mkdir(root, { recursive: true })
async function download(url, path) {
  try { await access(path); return } catch { /* first download */ }
  const host = new URL(url).host
  if (pausedHosts.has(host)) throw new Error(`Host paused after rate limit: ${host}`)
  const response = await fetch(url, { headers: { 'User-Agent': 'EcoCycle-Academic-Dataset-Review/1.0' }, signal: AbortSignal.timeout(60000) })
  if (response.status === 429) pausedHosts.add(host)
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.from(await response.arrayBuffer()))
}
const tasks = []
const branch = await (await fetch('https://api.github.com/repos/MHCI/broken-interfaces/branches/master')).json()
if (!branch.commit?.sha) throw new Error('Cannot pin MHCI source revision')
const tree = JSON.parse(await readFile('ml/condition_training/sources/mhci-tree.json', 'utf8'))
for (const entry of tree.tree) {
  if (!/^(phone_originals|phone_damage_annotation)\//.test(entry.path) || entry.type !== 'blob') continue
  const url = `https://raw.githubusercontent.com/MHCI/broken-interfaces/${branch.commit.sha}/${entry.path}`
  const path = resolve(root, 'mhci', entry.path)
  tasks.push(async () => {
    await download(url, path)
    manifest.push({ source: 'MHCI broken-interfaces', revision: branch.commit.sha, file: path, url, license: 'CC BY 4.0', author: 'Schaub, Seifert, Honold, Mueller, Rukzio, Weber (CHI 2014)' })
  })
}
const seen = new Set()
for (let index = 0; index <= 6; index++) {
  const data = JSON.parse(await readFile(`ml/condition_training/sources/commons-extra-${index}.json`, 'utf8'))
  for (const page of Object.values(data.query?.pages || {})) {
    if (seen.has(page.pageid)) continue
    seen.add(page.pageid)
    const info = page.imageinfo?.[0], meta = info?.extmetadata
    const license = meta?.LicenseShortName?.value || ''
    if (!/CC BY|CC0|Public domain/i.test(license)) continue
    const url = info.thumburl || info.url
    if (!url || /\.svg(?:\?|$)/i.test(url)) continue
    const path = resolve(root, 'commons', `${page.pageid}.jpg`)
    tasks.push(async () => {
      await download(url, path)
      manifest.push({ source: 'Wikimedia Commons', queryIndex: index, pageId: page.pageid, title: page.title,
        file: path, url, sourcePage: info.descriptionurl, license,
        author: meta?.Artist?.value, description: meta?.ImageDescription?.value })
    })
  }
}
let cursor = 0, failures = []
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < tasks.length) {
    const index = cursor++
    try { await tasks[index]() } catch (error) { failures.push(String(error)) }
    if ((index + 1) % 50 === 0) console.log(`Processed ${index + 1}/${tasks.length}`)
  }
}))
await writeFile(resolve(root, 'manifest.json'), JSON.stringify({ manifest, failures }, null, 2))
console.log(JSON.stringify({ downloaded: manifest.length, failed: failures.length, revision: branch.commit.sha }))
