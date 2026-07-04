import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy de desenvolvimento: o navegador chama /proposta-api/... (mesma origem)
// e o Vite repassa pra API no Render, evitando CORS em dev.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/proposta-api': {
        target: 'https://ubusiness-proposta-api.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proposta-api/, ''),
      },
    },
  },
})
