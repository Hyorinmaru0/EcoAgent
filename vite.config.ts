import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ecoBotMiddleware } from './server/ecobot.mjs'

const ecoBotApi: Plugin = {
  name: 'ecoagent-ecobot-api',
  configureServer(server) {
    server.middlewares.use(ecoBotMiddleware)
  },
  configurePreviewServer(server) {
    server.middlewares.use(ecoBotMiddleware)
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ecoBotApi],
})
