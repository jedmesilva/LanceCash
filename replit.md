# Lance Cash

Protótipo responsivo de leilões de lances com saldo, compras Pix simuladas, conta de demonstração e resgate de prêmios.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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

- The web client calls the shared API server through `/api`; auction state and actions are not implemented in the browser.
- This build preserves the uploaded prototype's simulated Pix and account behavior; it does not process payments or authenticate real users.
- Keep the Lance Cash interface light; do not switch themes based on the device's dark-mode preference.
- Prototype state is held in server memory to match the original's demo nature; it resets when the API server restarts.

## Product

Users browse live, ended, and upcoming auctions; place simulated bids; add bid packs through a simulated Pix flow; edit demo profile details; and view or redeem demo prizes. The layout is responsive for desktop and mobile.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
