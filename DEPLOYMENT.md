# Deploying Lance Cash to Vercel and Railway

This workspace is a pnpm monorepo. Set the repository root (`.`) as the root
directory in both platforms. The Vercel build serves the Vite app and forwards
`/api/*` through Vercel to Railway, keeping account cookies first-party.
Auction updates use a direct secure WebSocket connection to Railway.

## Railway API

1. Create or select a Railway project. Keep its service root directory at the
   repository root.
2. Link the project with the Railway CLI, then run `railway config plan` from
   the repository root. Review the plan before applying it;
   `.railway/railway.ts` configures the API build, start command, health check,
   and production mode. If the plan proposes creating or replacing resources
   you do not intend to change, stop and reconcile the Railway service before
   applying.
3. After the API service exists, connect this repository as its source in
   Railway's service settings. The IaC file deliberately leaves the repository
   owner and name unspecified.
4. Add these variables to the API service in Railway:
   - `DATABASE_URL`: the PostgreSQL connection string used by the app.
   - `SESSION_SECRET`: a long, random secret; keep it only in Railway's
     environment-variable settings.
   - `CORS_ALLOWED_ORIGINS`: comma-separated exact browser origins, such as
     `https://your-project.vercel.app`. Include any Vercel preview or custom
     domains that should be allowed to open the live-auction WebSocket.
5. Generate a public Railway domain for the API. Railway supplies `PORT`.
   The health check is `/api/healthz`.

The Railway IaC file intentionally does not declare a GitHub repository source
or database resource. Connect the repository and use the existing PostgreSQL
provider rather than provisioning or migrating a database as part of this setup.

## Vercel frontend

1. Import the same repository in Vercel and set the root directory to `.`.
2. Add these variables for every Vercel environment you intend to deploy:
   - `RAILWAY_API_URL`: Railway's public HTTPS origin only, for example
     `https://your-api.up.railway.app` (no `/api` suffix).
   - `VITE_AUCTION_WS_URL`: the matching secure WebSocket URL, for example
     `wss://your-api.up.railway.app/ws`.
3. Deploy. `vercel.mjs` runs the Vite build, publishes
   `artifacts/lance-cash/dist/public`, rewrites `/api/*` to Railway, and falls
   back to `index.html` for frontend routes.
4. After the Vercel production domain is known, add it to
   `CORS_ALLOWED_ORIGINS` in Railway and redeploy the API. Include a preview
   origin only if that preview should receive live updates.

Do not put database credentials or `SESSION_SECRET` in Vercel. REST and auth
requests stay on the Vercel origin through the rewrite; only the public,
read-only auction WebSocket connects directly to Railway.
