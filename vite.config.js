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
    // Google ile giris signInWithPopup kullaniyor. Chrome'un varsayilan
    // COOP davranisi altinda acan sayfa popup referansini kaybediyor;
    // Firebase popup'i `window.closed` ile izleyemiyor, kapatamiyor ve
    // signInWithPopup sozu hic sonuclanmiyor. Kimlik dogrulama arka planda
    // BASARILI oluyor, yalnizca popup "sign in"de donuyor.
    // `same-origin-allow-popups`, sayfanin kendi actigi popup'larla
    // konusmasina izin verir — Firebase'in bu akis icin onerdigi deger.
    // Yalnizca gelistirme sunucusu icin; uretim derlemesini etkilemez.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
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
          // 'charts' chunk removed — recharts is no longer a dependency
          // (3 chart wrappers under src/components/charts/ that imported
          // it were never wired into any page).
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
