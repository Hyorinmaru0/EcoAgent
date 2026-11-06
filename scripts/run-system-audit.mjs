import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const directory = await mkdtemp(join(tmpdir(), "ecocycle-browser-check-"))
const databasePath = join(directory, "audit.sqlite")
const base = "http://127.0.0.1:5190"
const env = { ...process.env, ECOCYCLE_DB_PATH: databasePath, AUDIT_BASE_URL: base }
let server

async function run(args) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true })
  const [code] = await once(child, "exit")
  if (code !== 0) throw new Error(`Audit command failed with exit code ${code}.`)
}

try {
  await run([resolve("node_modules/vite/bin/vite.js"), "build"])
  server = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "5190", "--strictPort"], { env, stdio: "ignore", windowsHide: true })
  let ready = false
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Audit server could not start on port 5190.")
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) { ready = true; break }
    } catch { /* Wait for the isolated preview server to start. */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error("Audit server did not become ready.")
  await run([resolve("scripts/check-system.mjs")])
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (server && server.exitCode === null) {
    const stopped = once(server, "exit")
    server.kill()
    await stopped
  }
  // Delete only the known database files in the directory created by this run.
  for (const suffix of ["", "-wal", "-shm"]) await rm(databasePath + suffix, { force: true })
  await rmdir(directory)
}
