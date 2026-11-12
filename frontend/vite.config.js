import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stamps a fresh id into the service worker on every build, so the browser sees a changed
// sw.js after each release and offers the update (see public/sw.js).
const stampServiceWorker = () => ({
  name: 'stamp-service-worker',
  apply: 'build',
  closeBundle: {
    order: 'post',
    handler() {
      const file = path.resolve('dist/sw.js')
      if (!fs.existsSync(file)) return
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', Date.now().toString(36)))
    },
  },
})

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  // BizTrack pages have always imported with "@/..." — kept so they move across unchanged.
  build: {
    rollupOptions: {
      output: {
        // Library code is split into files that change rarely, so a returning visitor keeps them cached across releases.
        // react + the network libraries are needed by every screen and load at start-up; pdf, excel, charts and scan are
        // only downloaded when a page or button needs them (exports, charts, barcode camera).
        manualChunks(id) {
          // Vite's own dynamic-import helper must live with the start-up code. If it lands in the PDF chunk, the
          // PDF chunk (400 kB) is downloaded on every first visit just to get this helper.
          if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) return 'react';
          // The two translation dictionaries (~340 kB) change far less often than the code: own files, cached across releases.
          if (/\/src\/lang\/en\.json$/.test(id)) return 'lang-en';
          if (/\/src\/lang\/sw\.json$/.test(id)) return 'lang-sw';
          if (!id.includes('node_modules')) return undefined;
          const pkg = id.split('node_modules/').pop();
          if (/^(react|react-dom|react-router|react-router-dom|scheduler)\//.test(pkg)) return 'react';
          if (/^(axios|socket\.io-client|socket\.io-parser|engine\.io-client|engine\.io-parser|@socket\.io)\//.test(pkg)) return 'network';
          if (/^(jspdf|jspdf-autotable)\//.test(pkg)) return 'pdf';
          if (/^xlsx\//.test(pkg)) return 'excel';
          if (/^(recharts|recharts-scale|victory-vendor|d3-[\w-]+|internmap|decimal\.js-light|react-smooth|react-transition-group|fast-equals|eventemitter3|lodash)\//.test(pkg)) return 'charts';
          if (/^(@zxing)\//.test(pkg)) return 'scan';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
})
