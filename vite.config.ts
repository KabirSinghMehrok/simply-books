import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // lucide-react's ~1500-module barrel makes cold dev starts crawl without this
  optimizeDeps: { include: ['lucide-react'] },
})
