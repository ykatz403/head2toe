import { defineConfig, devices } from '@playwright/test'

const PORT = 5081
const BASE = `http://localhost:${PORT}`

/**
 * Acceptance tests run the real thing: the built React app served by the real C# API on a throwaway database.
 * Build first: `npm run build` (writes to ../api/wwwroot) and `dotnet build ../api`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // One at a time: each page renders 3D in software (no GPU in CI), and parallel pages starve the server.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    // Reduced motion keeps the software-rendered 3D from spinning and starving the page on a high-DPI phone.
    { name: 'mobile', use: { ...devices['Pixel 7'], reducedMotion: 'reduce' }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'node e2e/start-api.mjs',
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      E2E_URL: BASE,
      ASPNETCORE_ENVIRONMENT: 'Development',
      ConnectionStrings__Default: 'Data Source=e2e.db',
      RateLimit__AuthPerMinute: '10000',
      Logging__LogLevel__Default: 'Warning',
      Logging__LogLevel__Microsoft: 'Warning',
    },
  },
})
