# Head2Toe

See a full head-to-toe outfit on a 3D avatar built from your own one-time body scan, then shop every piece.

## How it works

- Pick an occasion (summer, winter, pool day) and where you shop (designer, everyday, or both).
- Scan yourself once at home: a front and a side photo plus height and weight. Pose detection runs **in the browser**, so photos never leave the device. Only the measurements are saved.
- The avatar is you. Every piece of the outfit has a tracked shop link. Affiliate commission is the main revenue.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, three.js |
| Body scan | MediaPipe pose landmarker, running in the browser (WASM) |
| Backend | ASP.NET Core 10 minimal API, EF Core, SQLite (swap for Postgres or SQL Server in production) |
| Auth | JWT, BCrypt password hashing, rate-limited auth endpoints |
| Tests | xUnit + WebApplicationFactory, Vitest + Testing Library, Playwright + axe |

## Layout

```
src/api/            C# API: auth, saved scan, outfit engine, /go/{id} click tracking
src/web/            React app (builds into src/api/wwwroot so one process serves everything)
src/tests/api/      .NET unit and integration tests
src/web/e2e/        Playwright acceptance tests (real browser, real API, real database)
prototype/          original single-page stakeholder demo
```

## Run it

Needs .NET 10 and Node 24 LTS.

```bash
cd src/web && npm install     # also copies the MediaPipe runtime and downloads the pose model (~6 MB)
npm run build                 # builds the React app into src/api/wwwroot
cd ../api && dotnet run --urls http://localhost:5080
```

Open http://localhost:5080. For front-end development run `npm run dev` in `src/web` (port 5173, proxies to the API on 5080).

## Test it

```bash
cd src/tests/api && dotnet test       # API: unit + integration
cd src/web && npm test                # React: unit + component
cd src/web && npm run build && (cd ../api && dotnet build) && npx playwright install chromium
cd src/web && npm run test:e2e        # acceptance: real browser against the real app
```

The acceptance suite runs one test at a time on purpose: each page renders 3D in software, and parallel pages starve the server.

## Configuration

| Setting | Where | Notes |
|---|---|---|
| `Jwt__Key` | env var | **Required outside Development.** 32+ random bytes. The app refuses to start with the dev key in production. |
| `ConnectionStrings__Default` | env var | Defaults to a local SQLite file |
| `Cors__Origins__0` | env var | Only needed if the front end is hosted on a different origin |
| `RateLimit__AuthPerMinute` | env var | Sign-in and sign-up attempts per IP per minute (default 10) |

## Known limits

- Body measurement is a heuristic: build comes from height and weight, refined by shoulder and hip proportions in the front photo. Calibrate against measured volunteers before promising accuracy.
- The catalog is a hand-made seed. Real products need affiliate feeds (Awin, Rakuten, Impact) and their approvals.
- Not built yet: Stripe subscription, password reset, email verification, database migrations (the app uses `EnsureCreated`).
- The original stakeholder demo lives in `prototype/` and includes the revenue model calculator.
