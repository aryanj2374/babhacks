# 🎫 OpenTix — XRPL Ticketing Platform (1st Place Ripple Track $2000)
Created by: Aryan Achuthan, Aryan Jain, Arvind Krishna Sivakumar, Kabilesh Yuvaraj

A full-stack NFT ticketing platform built on the **XRP Ledger Testnet**. Tickets are minted as XLS-20 NFTs with built-in price caps and automatic royalties via XRPL's `TransferFee`.
## Demo  
https://www.youtube.com/watch?v=bAh8SJxKHC0 

## Features

- **User Accounts** — Sign up as a Fan or Organizer with email/password
- **Automatic Wallet Creation** — XRPL Testnet wallet funded on signup
- **Wallet Management** — View XRP balances
- **Event Creation** — Organizers create events and mint NFT tickets
- **Ticket Marketplace** — Browse and buy tickets with native XRP
- **Price Caps** — Max resale price enforcement on every resale
- **Auto Royalties** — Configurable royalty (0–50%) auto-paid to organizer on every resale (XRPL protocol-level)
- **QR Ticket Verification** — Generate QR codes, verify ownership on-chain
- **Ticket Redemption** — Organizers mark tickets as redeemed at events

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Backend | Express.js |
| Database | MongoDB (Mongoose) |
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
```

### Development Mode (with hot reload)

```bash
# Terminal 1: Express API server
npm run dev

# Terminal 2: Vite dev server (proxies /api to :3000)
cd client && npm run dev
# → http://localhost:5173
```

## Environment Variables

Create a `.env` file in the root:

```
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-secret
ENCRYPTION_KEY=your-key
PORT=3000
```

## XRPL Primitives Used

| Primitive | Purpose |
|-----------|---------|
| `NFTokenMint` | Mint event tickets as NFTs |
| `NFTokenCreateOffer` | Create buy/sell offers for tickets |
| `NFTokenAcceptOffer` | Execute atomic NFT ↔ XRP swaps |
| `TransferFee` | Auto-collect royalties on every resale |
| `account_nfts` | Verify ticket ownership on-chain |

## API Endpoints

### Auth
- `POST /api/auth/signup` — Create account + XRPL wallet
- `POST /api/auth/login` — Get JWT token
- `GET /api/auth/me` — Current user profile

### Wallet
- `GET /api/wallet/balance` — XRP balance

### Events
- `GET /api/events` — List all events
- `GET /api/events/:id` — Event detail + tickets
- `POST /api/events` — Create event (organizer)

### Tickets
- `POST /api/tickets/mint` — Mint NFT tickets (organizer)
- `POST /api/tickets/buy` — Buy a ticket
- `POST /api/tickets/resell` — Resell with OpenTix price-cap checks
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
│   ├── auth.js            # JWT middleware
│   ├── crypto.js          # AES-256 encryption
│   ├── xrplClient.js      # XRPL connection manager
│   ├── models/            # Mongoose models (User, Event, Ticket)
│   └── routes/            # API route handlers
├── client/                # React + Vite frontend
│   └── src/
│       ├── pages/         # Login, Signup, Dashboard, etc.
│       ├── components/    # Navbar, shared components
│       ├── context/       # Auth context (React)
│       └── lib/           # API helper
└── src/                   # XRPL integration modules
    ├── config.js          # Network config
    ├── wallet.js          # Wallet creation
    ├── ticket.js          # Mint, buy, resell, verify
    └── utils.js           # Metadata encoding, helpers
```

## License

MIT
