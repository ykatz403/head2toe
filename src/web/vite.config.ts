import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// In development the React app proxies API calls to the C# backend.
// In production `npm run build` writes into the API's wwwroot, so one .NET process serves both.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5080',
      '/go': 'http://localhost:5080',
    },
  },
  build: {
    outDir: '../api/wwwroot',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
