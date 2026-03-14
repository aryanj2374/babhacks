/**
 * XRPL Anti-Scalping Ticketing System — Express API Server
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const { getClient, disconnectClient } = require('./server/xrplClient');
const logger = require('./server/logger');

const authRoutes    = require('./server/routes/auth');
const walletRoutes  = require('./server/routes/wallet');
const eventRoutes   = require('./server/routes/events');
const ticketRoutes  = require('./server/routes/tickets');
const verifyRoutes  = require('./server/routes/verify');
const mongoRoutes   = require('./server/routes/mongo');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth',    authRoutes);
app.use('/api/wallet',  walletRoutes);
app.use('/api/events',  eventRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/verify',  verifyRoutes);
app.use('/api/mongo',   mongoRoutes);

// ── Health check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ── MongoDB Connection ──────────────────────────────────────────
async function connectMongo() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/xrpl-ticketing';
  try {
    await mongoose.connect(uri);
    logger.info('MONGO', `Connected to MongoDB at ${uri.replace(/\/\/.*@/, '//<credentials>@')}`);
  } catch (err) {
    logger.error('MONGO', err);
    console.log('  ⚠️  MongoDB not available — start a local MongoDB instance or set MONGO_URI in .env.');
    process.exit(1);
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
  console.log(`  📝 Logs:    logs/debug.log`);
  console.log('═══════════════════════════════════════════════════════\n');

  await connectMongo();

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
