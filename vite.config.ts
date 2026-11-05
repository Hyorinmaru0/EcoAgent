
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ecoBotMiddleware } from './server/ecobot.mjs'
import { createTvDetectionMiddleware } from './server/tv-detection.mjs'
import { facilityApiMiddleware } from './server/facility-api.mjs'
import { authApiMiddleware } from './server/auth-api.mjs'

const ecoBotApi: Plugin = {
  name: 'ecoagent-ecobot-api',

  configureServer(server) {
    server.middlewares.use(createTvDetectionMiddleware())
    server.middlewares.use(authApiMiddleware)
    server.middlewares.use(facilityApiMiddleware)
    server.middlewares.use(ecoBotMiddleware)
  },

  configurePreviewServer(server) {
    server.middlewares.use(createTvDetectionMiddleware())
    server.middlewares.use(authApiMiddleware)
    server.middlewares.use(facilityApiMiddleware)
    server.middlewares.use(ecoBotMiddleware)
  },
}

export default defineConfig(({ mode }) => {
  // Vite reloads this config in the same process. Remove only values this
  // config injected previously, otherwise loadEnv treats stale model paths as
  // external overrides and ignores a rollback in .env.
  const state = globalThis as typeof globalThis & { __ecoCycleInjectedServerEnv?: Record<string, string> }
  for (const [key, value] of Object.entries(state.__ecoCycleInjectedServerEnv || {})) {
    if (process.env[key] === value) delete process.env[key]
  }
  state.__ecoCycleInjectedServerEnv = {}
  const serverEnv = loadEnv(mode, process.cwd(), ['GEMINI_', 'TV_DETECTOR_', 'DEVICE_DETECTOR_', 'DAMAGE_DETECTOR_', 'REFERENCE_DETECTOR_'])

  const assignServerEnv = (key: string, value: string) => {
    if (process.env[key] === undefined) state.__ecoCycleInjectedServerEnv![key] = value
    process.env[key] = value
  }

  for (const key of ['TV_DETECTOR_PYTHON', 'TV_DETECTOR_WEIGHTS', 'DEVICE_DETECTOR_WEIGHTS', 'DAMAGE_DETECTOR_WEIGHTS', 'REFERENCE_DETECTOR_WEIGHTS']) {
    if (serverEnv[key]) assignServerEnv(key, serverEnv[key])
  }

  if (serverEnv.GEMINI_API_KEY) {
    assignServerEnv('GEMINI_API_KEY', serverEnv.GEMINI_API_KEY)
  }

  assignServerEnv('GEMINI_MODEL', serverEnv.GEMINI_MODEL || 'gemini-3.1-flash-lite')

  return {
    // The YOLO datasets and training reports live inside this folder. Watching
    // tens of thousands of files on OneDrive stalls the first request for
    // over a minute, so only application sources are watched.
    server: {
      watch: {
        ignored: ['**/ml/**', '**/reports/**', '**/runs/**', '**/.idea/**'],
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      ecoBotApi,
    ],
  }
})
