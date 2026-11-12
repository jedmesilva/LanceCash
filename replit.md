# Lance Cash

Protótipo responsivo de leilões de lances com saldo, compras Pix simuladas, conta de demonstração e resgate de prêmios.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/lance-cash run dev` — run the React client (port 20112)
- For local development, run both services in separate terminals. Replit starts them as managed workflows.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes to development
- Required env: `DATABASE_URL` (Postgres connection string) and `SESSION_SECRET` (account sessions)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/lance-cash/` — standalone React client
- `artifacts/lance-cash/src/design-system/` — app-specific color, type, radius, spacing tokens and reusable visual components
- `artifacts/lance-cash/src/lance-cash.css` — responsive presentation styles that consume the design tokens
- `artifacts/api-server/src/lib/lance-cash.ts` — prototype auction and account state
- `artifacts/api-server/src/routes/lance-cash.ts` — REST endpoints for client actions
- `lib/api-spec/openapi.yaml` — API source of truth; generated TypeScript/Zod clients live in `lib/api-client-react/` and `lib/api-zod/`

## Architecture decisions

- The web client calls the shared API server through `/api`; auctions, bids, accounts, balances, package purchases, and prize redemptions are stored in PostgreSQL.
- Pix purchases are simulated and no real payments are processed. Registered accounts use app-managed email/password sessions, with passwords stored as hashes.
- Keep the Lance Cash interface light; do not switch themes based on the device's dark-mode preference.
- The API seeds the demo user, bid packages, and sample auction history once when the database is empty. Auction timers and simulated activity are persisted, so restarting the API does not reset the state.
- The demo account is shared; registered accounts use PostgreSQL-backed sessions.

## Product

Users browse live, ended, and upcoming auctions; place simulated bids; add bid packs through a simulated Pix flow; edit demo profile details; and view or redeem demo prizes. The layout is responsive for desktop and mobile.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
