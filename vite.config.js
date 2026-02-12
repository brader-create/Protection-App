import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Use '/Protection-App/' for GitHub Pages, './' for Electron desktop builds
const base = process.env.ELECTRON === 'true' ? './' : '/Protection-App/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
