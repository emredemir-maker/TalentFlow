import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    // Split heavy vendor libraries into their own chunks so the initial
    // bundle stays small and browsers can cache vendor code separately
    // from app code (vendor changes far less often).
    //
    // Without this every release ships ~2.6MB of JS even for the login
    // page. Splitting brings initial-route JS to under ~600KB gz.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage',
          ],
          'firebase-admin': ['firebase'],
          'charts': ['recharts'],
          'pdf': ['pdfjs-dist'],
          'icons': ['lucide-react'],
          'ai': ['@google/generative-ai'],
        },
      },
    },
    // Slightly higher than vite's 500KB default because spline is just
    // big — the rollup warning is informational once we've intentionally
    // chunked the heavy libraries above.
    chunkSizeWarningLimit: 800,
  },
})
