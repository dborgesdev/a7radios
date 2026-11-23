import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwind()],
  build: { manifest: true },
  server: {
    proxy: process.env.A7_WP_ORIGIN ? {
      '/app': { target: process.env.A7_WP_ORIGIN },
    } : undefined,
  },
})
