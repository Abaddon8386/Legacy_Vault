import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import process from 'node:process'

const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Same-origin browser requests become same-origin at the upstream hop too.
            // Preserve foreign origins so the backend can still reject them.
            if (req.headers.origin === `http://${req.headers.host}`) {
              proxyReq.setHeader('Origin', new URL(apiTarget).origin)
            }
          })
        },
      },
    },
  },
})
