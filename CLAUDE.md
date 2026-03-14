# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Running the app
```bash
# Start the backend server (port 3000)
npm start

# Start the frontend dev server (port 5173, proxies /api/* to :3000)
cd client && npm run dev

# Both must run simultaneously for full-stack development
```

### Building & seeding
```bash
npm run build:client   # Build React app into client/dist (served by Express in prod)
npm run seed           # Seed test users + sample event into SQLite
node demo.js           # Run CLI demo of the full XRPL ticket lifecycle
```

### No test suite exists. Manual testing via the UI or `demo.js`.

## Architecture

### Monorepo layout
- `server.js` — Express entry point; mounts all routes, serves `client/dist` in production
- `server/` — Route handlers, auth middleware, DB, crypto, XRPL client
- `src/` — Pure XRPL business logic (wallet, ticket, utils) used by server routes
- `client/src/` — React + Vite SPA
- `data/ticketing.db` — SQLite file, auto-created on first run

### Request flow
Browser → Vite dev proxy (`/api/*` → `:3000`) → Express routes → `src/` XRPL logic → XRPL Testnet WebSocket

### Authentication
JWT stored in `localStorage`. `server/auth.js` exports `authMiddleware` (verify token) and `requireOrganizer` (role check). `client/src/lib/api.js` attaches the token to every request. `client/src/context/AuthContext.jsx` manages user state, loading JWT via `/api/auth/me` on mount.

### XRPL integration
`server/xrplClient.js` manages a singleton WebSocket connection to `wss://s.altnet.rippletest.net:51233`. All XRPL operations go through `src/wallet.js` and `src/ticket.js`:
- Wallets are created on signup via `client.fundWallet()` (Testnet faucet, takes 10–20s)
- NFT tickets use `NFTokenMint` with `TransferFee: 1000` (10% royalty, protocol-enforced)
- Buys/resales use `NFTokenCreateOffer` + `NFTokenAcceptOffer` (atomic swap)
- RLUSD is a simulated stablecoin: TrustSet → Payment (IOU) from platform issuer wallet stored in `platform_config` table

### Anti-scalping enforcement
Two layers:
1. **Application layer** — `tickets.max_resale_price` and `tickets.max_resales` checked in `server/routes/tickets.js` before any on-chain action
2. **Protocol layer** — `TransferFee` auto-collects 10% royalty on every NFT resale at the XRPL level

### Database
SQLite via `better-sqlite3` (synchronous). Schema defined inline in `server/db.js`. Key tables: `users`, `wallets`, `events`, `tickets`, `transactions`, `platform_config`. Wallet seeds are AES-256-CBC encrypted (`server/crypto.js`) before storage.

### Frontend structure
- `client/src/App.jsx` — All routes; `ProtectedRoute` requires auth, `OrganizerRoute` requires organizer role
- `client/src/components/Icons.jsx` — All icons are inline SVGs; import from here, never add an icon npm package
- `client/src/index.css` — Single stylesheet, uses CSS custom properties (`var(--*)`) for theming; DM Sans + DM Mono fonts
- No state management library; all state is local React `useState` + `AuthContext`

### Environment variables
| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | `xrpl-ticketing-dev-secret-change-in-prod` | Change in production |
| `ENCRYPTION_KEY` | `xrpl-ticket-dev-key` | Used for AES seed encryption |
| `PORT` | `3000` | Express port |

### Test accounts (after `npm run seed`)
- `organizer@test.com` / `password123` — can create events, mint tickets
- `fan1@test.com` / `password123` — fan, pre-funded with RLUSD
- `fan2@test.com` / `password123` — fan, pre-funded with RLUSD
