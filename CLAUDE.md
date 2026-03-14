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
node demo.js           # Run CLI demo of the full XRPL ticket lifecycle
```

### No test suite exists. Manual testing via the UI or `demo.js`.

## Architecture

### Monorepo layout
- `server.js` — Express entry point; mounts all routes, serves `client/dist` in production
- `server/` — Route handlers, auth middleware, crypto, XRPL client, Mongoose models
- `src/` — Pure XRPL business logic (wallet, ticket, utils) used by server routes
- `client/src/` — React + Vite SPA

### Request flow
Browser → Vite dev proxy (`/api/*` → `:3000`) → Express routes → `src/` XRPL logic → XRPL Testnet WebSocket

### Authentication
JWT stored in `localStorage`. `server/auth.js` exports `authMiddleware` (verify token) and `requireOrganizer` (role check). `client/src/lib/api.js` attaches the token to every request. `client/src/context/AuthContext.jsx` manages user state, loading JWT via `/api/auth/me` on mount.

### Database
MongoDB via Mongoose. Models in `server/models/`: `User`, `Event`, `Ticket`. Wallet seeds are AES-256-CBC encrypted (`server/crypto.js`) before storage in `User.xrplSeed`. Requires `MONGO_URI` env var pointing to a MongoDB Atlas cluster.

### XRPL integration
`server/xrplClient.js` manages a singleton WebSocket connection to `wss://s.altnet.rippletest.net:51233`. All XRPL operations go through `src/wallet.js` and `src/ticket.js`:
- Wallets are created on signup via `client.fundWallet()` (Testnet faucet, takes 10–20s)
- All payments use **native XRP** (no stablecoin/IOU). Amounts are stored as XRP strings (e.g. `"10"`); converted to drops via `xrpl.xrpToDrops()` when building transactions
- NFT tickets use `NFTokenMint` with a configurable `TransferFee` (royalty in XRPL basis points where 50000=50%, 10000=10%, 1000=1%). Defaults to `10000` (10%)
- Organizers set a custom royalty percentage (0–50%) per event; the route converts it: `royaltyBps = pct * 1000`
- Buys/resales use `NFTokenCreateOffer` (seller) + `NFTokenAcceptOffer` (buyer) — atomic swap, XRP transferred automatically

### OpenTix enforcement
Two layers:
1. **Application layer** — `ticket.maxResalePrice` checked in `server/routes/tickets.js` before any on-chain action; resale price cannot exceed the max set at mint time
2. **Protocol layer** — `TransferFee` auto-collects royalty on every NFT resale at the XRPL level (protocol-enforced, no smart contract needed)

### Frontend structure
- `client/src/App.jsx` — All routes; `ProtectedRoute` requires auth, `OrganizerRoute` requires organizer role
- `client/src/components/Icons.jsx` — All icons are inline SVGs; import from here, never add an icon npm package
- `client/src/index.css` — Single stylesheet, uses CSS custom properties (`var(--*)`) for theming; DM Sans + DM Mono fonts
- No state management library; all state is local React `useState` + `AuthContext`

### Environment variables
| Variable | Default | Notes |
|---|---|---|
| `MONGO_URI` | (required) | MongoDB Atlas connection string |
| `JWT_SECRET` | `xrpl-ticketing-dev-secret-change-in-prod` | Change in production |
| `ENCRYPTION_KEY` | `xrpl-ticket-dev-key` | Used for AES seed encryption |
| `PORT` | `3000` | Express port |

### Render deployment
- Build command: `npm install && cd client && npm install && npm run build`
- Start command: `node server.js`
- MongoDB Atlas: allow `0.0.0.0/0` in IP access list
