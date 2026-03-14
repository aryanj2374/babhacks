/**
 * XRPL Anti-Scalping Ticketing System — Express API Server
 * ═══════════════════════════════════════════════════════════════════
 *
 * Full-stack server with:
 *   - JWT authentication
 *   - SQLite database + MongoDB (dual persistence)
 *   - XRPL Testnet integration
 *   - Debug logging to console + file
 *   - React frontend (served from client/dist in production)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const xrpl = require('xrpl');

const { getDb } = require('./server/db');
const { encrypt } = require('./server/crypto');
const { getClient, disconnectClient } = require('./server/xrplClient');
const { createFundedWallet } = require('./src/wallet');
const { sleep } = require('./src/utils');
const logger = require('./server/logger');

const authRoutes = require('./server/routes/auth');
const walletRoutes = require('./server/routes/wallet');
const eventRoutes = require('./server/routes/events');
const ticketRoutes = require('./server/routes/tickets');
const verifyRoutes = require('./server/routes/verify');
const mongoRoutes = require('./server/routes/mongo');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/mongo', mongoRoutes);

// ── Health check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

const clientDist = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── MongoDB Connection ──────────────────────────────────────────
async function connectMongo() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/xrpl-ticketing';
  try {
    await mongoose.connect(uri);
    logger.info('MONGO', `Connected to MongoDB at ${uri.replace(/\/\/.*@/, '//<credentials>@')}`);
    return true;
  } catch (err) {
    logger.error('MONGO', err);
    console.log('  ⚠️  MongoDB not available — MongoDB features will be disabled.');
    console.log('     Set MONGO_URI in .env or start a local MongoDB instance.');
    return false;
  }
}

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

      db.prepare("INSERT INTO platform_config (key, value) VALUES ('issuer_address', ?)").run(issuerWallet.address);
      db.prepare("INSERT INTO platform_config (key, value) VALUES ('issuer_seed', ?)").run(encrypt(issuerWallet.seed));

      logger.info('SETUP', `Platform issuer created: ${issuerWallet.address}`);
    } catch (err) {
      logger.error('SETUP', err);
      console.log('  The server will still start. Issuer will be retried on next request.');
    }
  } else {
    logger.info('SETUP', `Platform issuer: ${existing.value}`);
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
  console.log(`  🗄️  Mongo:   http://localhost:${PORT}/api/mongo`);
  console.log(`  📝 Logs:    logs/debug.log`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Initialize SQLite
  getDb();
  logger.info('SETUP', 'SQLite database initialized');

  // Connect MongoDB
  await connectMongo();

  // Set up platform issuer
  await ensurePlatformIssuer();

  console.log('\n  🚀 Ready!\n');
});

process.on('SIGINT', async () => {
  await disconnectClient();
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    logger.info('SHUTDOWN', 'MongoDB disconnected');
  }
  process.exit(0);
});
