import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pwaIconNames = ['pwa-192x192.svg', 'pwa-512x512.svg', 'pwa-maskable-512x512.svg'];

// There is no public/ directory, so emit the PWA icons straight to dist root,
// where the web app manifest expects them (and serve them in dev, where
// generateBundle never runs).
function pwaIcons(): Plugin {
  const srcDir = fileURLToPath(new URL('./src/', import.meta.url));
  return {
    name: 'pwa-icons',
    generateBundle() {
      for (const name of pwaIconNames) {
        this.emitFile({
          type: 'asset',
          fileName: name,
          source: readFileSync(srcDir + name, 'utf8')
        });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const name = pwaIconNames.find((icon) => url.endsWith(`/${icon}`));
        if (!name) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end(readFileSync(srcDir + name, 'utf8'));
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/habit_tracker/',
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
        start_url: '/habit_tracker/',
        scope: '/habit_tracker/',
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
            src: 'pwa-maskable-512x512.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Precache the icons too (they are not in a public/ dir, so the
        // plugin's includeManifestIcons cannot pick them up), keeping the
        // installed app's icons available offline.
        // manifest.webmanifest is added separately via additionalManifestEntries.
        globPatterns: ['**/*.{js,css,html,svg}']
      }
    })
  ],
  server: {
    port: 3000
  }
});
