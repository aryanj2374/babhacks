/**
 * ═══════════════════════════════════════════════════════════════════
 * XRPL Anti-Scalping Ticketing System — Express API Server
 * ═══════════════════════════════════════════════════════════════════
 * 
 * REST API for the web-based demo interface.
 * Manages XRPL client connection and wallet state in memory.
 * 
 * Endpoints:
 *   POST /api/setup    — Initialize wallets and RLUSD
 *   POST /api/mint     — Mint a ticket NFT
 *   POST /api/buy      — Buy a ticket
 *   POST /api/resell   — Resell a ticket
 *   GET  /api/verify   — Verify ticket ownership
 *   GET  /api/status   — Get current system state
 */

const express = require('express');
const cors = require('cors');
const xrpl = require('xrpl');
const config = require('./src/config');
const { createFundedWallet, establishTrustLine, fundRLUSD, getRLUSDBalance } = require('./src/wallet');
const { mintTicket, buyTicket, resellTicket, verifyTicket } = require('./src/ticket');
const { getNFTokens, decodeMetadata, sleep } = require('./src/utils');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── In-memory state ──────────────────────────────────────────────
let client = null;
let state = {
  initialized: false,
  wallets: {},         // { organizer, fan1, fan2 }
  tickets: [],         // Array of minted ticket info
  transactions: [],    // Transaction log
};

// ── Helper: ensure connected ─────────────────────────────────────
async function ensureConnected() {
  if (!client || !client.isConnected()) {
    client = new xrpl.Client(config.XRPL_SERVER);
    await client.connect();
  }
  return client;
}

// ── POST /api/setup — Initialize wallets and RLUSD ───────────────
app.post('/api/setup', async (req, res) => {
  try {
    const c = await ensureConnected();

    // Create and fund three wallets
    const organizer = await createFundedWallet(c);
    await sleep(1000);
    const fan1 = await createFundedWallet(c);
    await sleep(1000);
    const fan2 = await createFundedWallet(c);
    await sleep(1000);

    // Establish trust lines for RLUSD
    await establishTrustLine(c, fan1, organizer.address);
    await sleep(500);
    await establishTrustLine(c, fan2, organizer.address);
    await sleep(500);

    // Fund fans with RLUSD
    await fundRLUSD(c, organizer, fan1, '1000');
    await sleep(500);
    await fundRLUSD(c, organizer, fan2, '1000');

    state.initialized = true;
    state.wallets = {
      organizer: { address: organizer.address, seed: organizer.seed },
      fan1: { address: fan1.address, seed: fan1.seed },
      fan2: { address: fan2.address, seed: fan2.seed },
    };
    state.tickets = [];
    state.transactions = [];

    // Get balances
    const balances = {
      fan1: await getRLUSDBalance(c, fan1.address, organizer.address),
      fan2: await getRLUSDBalance(c, fan2.address, organizer.address),
    };

    res.json({
      success: true,
      message: 'Wallets created, RLUSD distributed',
      wallets: {
        organizer: organizer.address,
        fan1: fan1.address,
        fan2: fan2.address,
      },
      balances,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/mint — Mint a ticket NFT ───────────────────────────
app.post('/api/mint', async (req, res) => {
  try {
    if (!state.initialized) throw new Error('Run setup first');
    const c = await ensureConnected();

    const { eventName, seat, originalPrice, maxResalePrice, eventDate, maxResales } = req.body;
    const organizer = xrpl.Wallet.fromSeed(state.wallets.organizer.seed);

    const metadata = {
      eventId: `EVT-${Date.now()}`,
      eventName: eventName || 'Blockchain Music Festival 2026',
      seat: seat || 'GA-001',
      originalPrice: originalPrice || '100',
      maxResalePrice: maxResalePrice || '150',
      eventDate: eventDate || '2026-12-31T20:00:00Z',
      maxResales: parseInt(maxResales) || 3,
    };

    const result = await mintTicket(c, organizer, metadata);
    state.tickets.push(result);
    state.transactions.push({
      type: 'MINT',
      txHash: result.txHash,
      tokenId: result.tokenId,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Ticket minted: ${metadata.seat}`,
      ticket: result,
      explorerUrl: `${config.EXPLORER_URL}/transactions/${result.txHash}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/buy — Buy a ticket ────────────────────────────────
app.post('/api/buy', async (req, res) => {
  try {
    if (!state.initialized) throw new Error('Run setup first');
    const c = await ensureConnected();

    const { ticketIndex, buyer } = req.body;
    const ticketIdx = ticketIndex || 0;
    const ticket = state.tickets[ticketIdx];
    if (!ticket) throw new Error(`Ticket index ${ticketIdx} not found`);

    const buyerKey = buyer || 'fan1';
    const buyerWallet = xrpl.Wallet.fromSeed(state.wallets[buyerKey].seed);
    const sellerWallet = xrpl.Wallet.fromSeed(state.wallets.organizer.seed);
    const issuerAddress = state.wallets.organizer.address;

    const result = await buyTicket(
      c, buyerWallet, sellerWallet, ticket.tokenId,
      ticket.metadata.originalPrice, issuerAddress
    );

    state.transactions.push({
      type: 'BUY',
      txHash: result.txHash,
      tokenId: result.tokenId,
      buyer: buyerKey,
      price: ticket.metadata.originalPrice,
      timestamp: new Date().toISOString(),
    });

    // Update ticket owner tracking
    state.tickets[ticketIdx].currentOwner = buyerKey;

    const balances = {
      fan1: await getRLUSDBalance(c, state.wallets.fan1.address, issuerAddress),
      fan2: await getRLUSDBalance(c, state.wallets.fan2.address, issuerAddress),
    };

    res.json({
      success: true,
      message: `${buyerKey} purchased ticket for ${ticket.metadata.originalPrice} RLUSD`,
      result,
      balances,
      explorerUrl: `${config.EXPLORER_URL}/transactions/${result.txHash}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/resell — Resell a ticket ──────────────────────────
app.post('/api/resell', async (req, res) => {
  try {
    if (!state.initialized) throw new Error('Run setup first');
    const c = await ensureConnected();

    const { ticketIndex, seller, buyer, resalePrice } = req.body;
    const ticketIdx = ticketIndex || 0;
    const ticket = state.tickets[ticketIdx];
    if (!ticket) throw new Error(`Ticket index ${ticketIdx} not found`);

    const sellerKey = seller || 'fan1';
    const buyerKey = buyer || 'fan2';
    const sellerWallet = xrpl.Wallet.fromSeed(state.wallets[sellerKey].seed);
    const buyerWallet = xrpl.Wallet.fromSeed(state.wallets[buyerKey].seed);
    const issuerAddress = state.wallets.organizer.address;

    const result = await resellTicket(
      c, sellerWallet, buyerWallet, ticket.tokenId,
      resalePrice, issuerAddress, ticket.metadata
    );

    state.transactions.push({
      type: 'RESELL',
      txHash: result.txHash,
      tokenId: result.tokenId,
      seller: sellerKey,
      buyer: buyerKey,
      price: resalePrice,
      royalty: result.royaltyPaid,
      timestamp: new Date().toISOString(),
    });

    // Update metadata resale count
    state.tickets[ticketIdx].metadata.resaleCount = result.newResaleCount;
    state.tickets[ticketIdx].currentOwner = buyerKey;

    const balances = {
      fan1: await getRLUSDBalance(c, state.wallets.fan1.address, issuerAddress),
      fan2: await getRLUSDBalance(c, state.wallets.fan2.address, issuerAddress),
    };

    res.json({
      success: true,
      message: `Ticket resold from ${sellerKey} to ${buyerKey} for ${resalePrice} RLUSD (royalty: ${result.royaltyPaid} RLUSD)`,
      result,
      balances,
      explorerUrl: `${config.EXPLORER_URL}/transactions/${result.txHash}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/verify — Verify ticket ownership ───────────────────
app.get('/api/verify', async (req, res) => {
  try {
    if (!state.initialized) throw new Error('Run setup first');
    const c = await ensureConnected();

    const { address, tokenId } = req.query;
    if (!address || !tokenId) {
      throw new Error('Provide address and tokenId query parameters');
    }

    const result = await verifyTicket(c, address, tokenId);
    res.json({ success: true, verification: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/status — Get current state ─────────────────────────
app.get('/api/status', async (req, res) => {
  try {
    if (!state.initialized) {
      return res.json({ success: true, initialized: false });
    }

    const c = await ensureConnected();
    const issuerAddress = state.wallets.organizer.address;

    // Get NFTs for each wallet
    const nfts = {};
    for (const [role, wallet] of Object.entries(state.wallets)) {
      const tokens = await getNFTokens(c, wallet.address);
      nfts[role] = tokens.map(t => {
        let meta = {};
        try { meta = decodeMetadata(t.URI); } catch {}
        return { tokenId: t.NFTokenID, metadata: meta };
      });
    }

    const balances = {
      fan1: await getRLUSDBalance(c, state.wallets.fan1.address, issuerAddress),
      fan2: await getRLUSDBalance(c, state.wallets.fan2.address, issuerAddress),
    };

    res.json({
      success: true,
      initialized: true,
      wallets: {
        organizer: state.wallets.organizer.address,
        fan1: state.wallets.fan1.address,
        fan2: state.wallets.fan2.address,
      },
      balances,
      tickets: state.tickets,
      nfts,
      transactions: state.transactions,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🎫 XRPL Anti-Scalping Ticketing System');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  🌐 Web UI:  http://localhost:${PORT}`);
  console.log(`  📡 API:     http://localhost:${PORT}/api`);
  console.log(`  🔗 XRPL:    ${config.XRPL_SERVER}`);
  console.log('═══════════════════════════════════════════════════════\n');
});
