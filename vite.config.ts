
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ecoBotMiddleware } from './server/ecobot.mjs'
import { createTvDetectionMiddleware } from './server/tv-detection.mjs'

const ecoBotApi: Plugin = {
  name: 'ecoagent-ecobot-api',

  configureServer(server) {
    server.middlewares.use(createTvDetectionMiddleware())
    server.middlewares.use(ecoBotMiddleware)
  },

  configurePreviewServer(server) {
    server.middlewares.use(createTvDetectionMiddleware())
    server.middlewares.use(ecoBotMiddleware)
  },
}

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), ['GEMINI_', 'TV_DETECTOR_', 'DEVICE_DETECTOR_'])

  for (const key of ['TV_DETECTOR_PYTHON', 'TV_DETECTOR_WEIGHTS', 'DEVICE_DETECTOR_WEIGHTS']) {
    if (serverEnv[key]) process.env[key] = serverEnv[key]
  }

  if (serverEnv.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = serverEnv.GEMINI_API_KEY
  }

  process.env.GEMINI_MODEL =
    serverEnv.GEMINI_MODEL || 'gemini-3.5-flash-lite'

  return {
    plugins: [
      react(),
      tailwindcss(),
      ecoBotApi,
    ],
  }
})
