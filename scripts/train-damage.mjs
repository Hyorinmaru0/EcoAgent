import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const localPython = resolve(projectRoot, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python")
const python = process.env.TV_DETECTOR_PYTHON || (existsSync(localPython) ? localPython : "python")
const child = spawn(
  python,
  [resolve(projectRoot, "ml/damage_detection/build.py"), ...process.argv.slice(2)],
  { cwd: projectRoot, stdio: "inherit", windowsHide: true },
)
child.on("error", (error) => {
  console.error("Could not start the Python training environment:", error.message)
  console.error("Create .venv and install ml/tv_training/requirements-export.txt first.")
  process.exit(1)
})
child.on("exit", (code) => process.exit(code ?? 1))
