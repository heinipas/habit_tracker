import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pwaIconNames = ['pwa-192x192.svg', 'pwa-512x512.svg'];

// There is no public/ directory, so emit the PWA icons straight to dist root,
// where the web app manifest expects them.
function pwaIcons(): Plugin {
  const srcDir = fileURLToPath(new URL('./src/', import.meta.url));
  return {
    name: 'pwa-icons',
    apply: 'build',
    generateBundle() {
      for (const name of pwaIconNames) {
        this.emitFile({
          type: 'asset',
          fileName: name,
          source: readFileSync(srcDir + name, 'utf8')
        });
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/habit-tracker/',
  plugins: [
    react(),
    pwaIcons(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Habit Tracker',
        short_name: 'Habits',
        description: 'Track your habits daily',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/habit-tracker/',
        scope: '/habit-tracker/',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000
  }
});
