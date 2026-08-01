import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  // Two HTML entry points that boot the same app. index.html carries the
  // generic game link-preview; bride.html carries the bride-survey preview.
  // Netlify serves bride.html for ?role=bride links (see netlify.toml).
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bride: resolve(__dirname, 'bride.html'),
      },
    },
  },
})
