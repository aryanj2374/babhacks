# 🎫 XRPL Anti-Scalping Ticketing System
Created by: Aryan Jain, Arvind Krishna Sivakumar, Kabilesh Yuvaraj, Aryan Achuthan

A full-stack NFT ticketing platform built on the **XRP Ledger Testnet**. Tickets are minted as XLS-20 NFTs with built-in anti-scalping protections: max resale prices, resale limits, and automatic royalties via XRPL's `TransferFee`.

## Features

- **User Accounts** — Sign up as a Fan or Organizer with email/password
- **Automatic Wallet Creation** — XRPL Testnet wallet funded on signup
- **Wallet Management** — View XRP/RLUSD balances, demo RLUSD faucet
- **Event Creation** — Organizers create events and mint NFT tickets
- **Ticket Marketplace** — Browse and buy tickets with RLUSD stablecoin
- **Anti-Scalping** — Max resale price enforcement + resale count limits
- **Auto Royalties** — 10% royalty auto-paid to organizer on every resale (XRPL protocol-level)
- **QR Ticket Verification** — Generate QR codes, verify ownership on-chain
- **Ticket Redemption** — Organizers mark tickets as redeemed at events

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Backend | Express.js |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (jsonwebtoken) |
| Blockchain | XRPL Testnet (xrpl.js) |
| Crypto | AES-256-CBC (wallet seed encryption) |

## Quick Start

```bash
# 1. Install all dependencies
npm install
cd client && npm install && cd ..

# 2. Build the React frontend
npm run build:client

# 3. Start the server
npm run dev
# → http://localhost:3000

# 4. (Optional) Seed test data
# Keep the server running, then in another terminal:
npm run seed
```

### Development Mode (with hot reload)

```bash
# Terminal 1: Express API server
npm run dev

# Terminal 2: Vite dev server (proxies /api to :3000)
cd client && npm run dev
# → http://localhost:5173
```

## Test Accounts

After running `npm run seed`:

| Email | Password | Role |
|-------|----------|------|
| `organizer@test.com` | `password123` | Organizer |
| `fan1@test.com` | `password123` | Fan (Alice) |
| `fan2@test.com` | `password123` | Fan (Bob) |

Each fan account is pre-funded with **1000 RLUSD**. The organizer has a sample event with 3 minted tickets.

## XRPL Primitives Used

| Primitive | Purpose |
|-----------|---------|
| `NFTokenMint` | Mint event tickets as NFTs |
| `NFTokenCreateOffer` | Create buy/sell offers for tickets |
| `NFTokenAcceptOffer` | Execute atomic NFT ↔ RLUSD swaps |
| `TransferFee` | Auto-collect royalties on every resale |
| `TrustSet` | Establish trust lines for RLUSD (IOU) |
| `Payment` | Transfer RLUSD between accounts |
| `account_nfts` | Verify ticket ownership on-chain |

## API Endpoints

### Auth
- `POST /api/auth/signup` — Create account + XRPL wallet
- `POST /api/auth/login` — Get JWT token
- `GET /api/auth/me` — Current user profile

### Wallet
- `GET /api/wallet/balance` — XRP + RLUSD balances
- `POST /api/wallet/fund-rlusd` — Demo RLUSD faucet

### Events
- `GET /api/events` — List all events
- `GET /api/events/:id` — Event detail + tickets
- `POST /api/events` — Create event (organizer)

### Tickets
- `POST /api/tickets/mint` — Mint NFT tickets (organizer)
- `POST /api/tickets/buy` — Buy a ticket
- `POST /api/tickets/resell` — Resell with anti-scalping checks
- `POST /api/tickets/list-for-sale` — List on marketplace
- `GET /api/tickets/marketplace` — Browse available tickets
- `GET /api/tickets/my` — Your tickets
- `GET /api/tickets/:id/qr` — Generate QR code

### Verification
- `GET /api/verify/:ticketId` — Verify ticket on-chain
- `POST /api/verify/:ticketId/redeem` — Redeem ticket (organizer)

## Project Structure

```
├── server.js              # Main Express server
├── server/                # Backend modules
│   ├── db.js              # SQLite schema & connection
│   ├── auth.js            # JWT middleware
│   ├── crypto.js          # AES-256 encryption
│   ├── xrplClient.js      # XRPL connection manager
│   └── routes/            # API route handlers
├── client/                # React + Vite frontend
│   └── src/
│       ├── pages/         # Login, Signup, Dashboard, etc.
│       ├── components/    # Navbar, shared components
│       ├── context/       # Auth context (React)
│       └── lib/           # API helper
├── src/                   # XRPL integration modules
│   ├── config.js          # Network & token config
│   ├── wallet.js          # Wallet creation & RLUSD
│   ├── ticket.js          # Mint, buy, resell, verify
│   └── utils.js           # Metadata encoding, helpers
├── scripts/
│   └── seed.js            # Test data seeder
└── data/
    └── ticketing.db       # SQLite database (auto-created)
```

## License

MIT
