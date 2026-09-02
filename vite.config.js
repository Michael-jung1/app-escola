import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'StudyApp - Organização Escolar',
        short_name: 'StudyApp',
        description: 'Organize aulas, trabalhos e provas da escola em um só lugar.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Deixa o "shell" do app (html/js/css) em cache para abrir mesmo offline.
        // Os dados (Firestore) continuam sendo cuidados pela persistência offline configurada no App.jsx.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
})
