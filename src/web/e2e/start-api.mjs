// Starts the real API on a fresh, empty database for the acceptance tests.
// Playwright starts this before global setup, so the database is reset here, before the server opens it.
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

const api = join(process.cwd(), '..', 'api')
for (const suffix of ['', '-wal', '-shm']) rmSync(join(api, `e2e.db${suffix}`), { force: true })

const child = spawn('dotnet', ['bin/Debug/net10.0/Head2Toe.Api.dll', '--urls', process.env.E2E_URL], {
  cwd: api,
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill())
