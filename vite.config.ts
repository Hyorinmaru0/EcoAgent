import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Standalone Vite configuration for the exported Figma Make React app.
// Figma's original config required private .figma/make files that are not
// part of the extracted source; no Figma-only plugin is needed to run locally.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
})
