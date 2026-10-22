import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // served from the site root locally; `ZEEN_BASE=/zeen/ npm run build` for the copy on zirui.ca/zeen/
  base: process.env.ZEEN_BASE ?? '/',
  plugins: [react()],
  server: { host: true, port: 5173 },
})
