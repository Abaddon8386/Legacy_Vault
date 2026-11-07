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
            // Forward only the client IP so the backend's per-IP limits see real clients when it runs with
            // FORWARD_HEADERS_STRATEGY=native. Do not use `xfwd`: it also sends X-Forwarded-Host/Proto/Port, so the
            // backend would see host localhost:5196 while the rewritten Origin below is the API origin, and Spring
            // would reject every browser request with 403 "Invalid CORS request".
            const clientIp = req.socket?.remoteAddress
            if (clientIp) proxyReq.setHeader('X-Forwarded-For', clientIp)
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
