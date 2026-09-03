import {defineConfig} from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },

  server: {
    port: 5173,

    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }

});

