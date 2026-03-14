/**
 * ═══════════════════════════════════════════════════════════════════
 * XRPL Anti-Scalping Ticketing System — Express API Server
 * ═══════════════════════════════════════════════════════════════════
 *
 * Full-stack server with:
 *   - JWT authentication
 *   - SQLite database
 *   - XRPL Testnet integration
 *   - React frontend (served from client/dist in production)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const xrpl = require('xrpl');

const { getDb } = require('./server/db');
const { encrypt } = require('./server/crypto');
const { getClient, disconnectClient } = require('./server/xrplClient');
const { createFundedWallet } = require('./src/wallet');
const { sleep } = require('./src/utils');

// Import routes
const authRoutes = require('./server/routes/auth');
const walletRoutes = require('./server/routes/wallet');
const eventRoutes = require('./server/routes/events');
const ticketRoutes = require('./server/routes/tickets');
const verifyRoutes = require('./server/routes/verify');

const app = express();
app.use(cors());
app.use(express.json());

// ── API Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/verify', verifyRoutes);

// ── Health check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// ── Serve React frontend ────────────────────────────────────────
const clientDist = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Platform Issuer Setup ───────────────────────────────────────
async function ensurePlatformIssuer() {
  const db = getDb();
  const existing = db.prepare("SELECT value FROM platform_config WHERE key = 'issuer_address'").get();

  if (!existing) {
    console.log('🔧 Setting up platform RLUSD issuer wallet...');
    try {
      const client = await getClient();
      const issuerWallet = await createFundedWallet(client);
      await sleep(500);

      // Store issuer info
      db.prepare("INSERT INTO platform_config (key, value) VALUES ('issuer_address', ?)").run(issuerWallet.address);
      db.prepare("INSERT INTO platform_config (key, value) VALUES ('issuer_seed', ?)").run(encrypt(issuerWallet.seed));

      console.log(`  ✅ Platform issuer: ${issuerWallet.address}`);
    } catch (err) {
      console.error('  ⚠️ Could not create platform issuer:', err.message);
      console.log('  The server will still start. Issuer will be retried on next request.');
    }
  } else {
    console.log(`  ✅ Platform issuer: ${existing.value}`);
  }
}

// ── Start server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🎫 XRPL Anti-Scalping Ticketing System');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  🌐 Web UI:  http://localhost:${PORT}`);
  console.log(`  📡 API:     http://localhost:${PORT}/api`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Initialize DB
  getDb();
  console.log('  ✅ Database initialized');

  // Set up platform issuer
  await ensurePlatformIssuer();

  console.log('\n  🚀 Ready!\n');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n  Shutting down...');
  await disconnectClient();
  process.exit(0);
});
