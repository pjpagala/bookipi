import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Avoids CORS setup on the backend during local dev.
    proxy: {
      '/sale': 'http://localhost:3000',
      '/purchase': 'http://localhost:3000',
    },
  },
})
