/**
 * XRPL Anti-Scalping Ticketing System — Express API Server
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const { getDb } = require('./server/db');
const { disconnectClient } = require('./server/xrplClient');

const authRoutes = require('./server/routes/auth');
const walletRoutes = require('./server/routes/wallet');
const eventRoutes = require('./server/routes/events');
const ticketRoutes = require('./server/routes/tickets');
const verifyRoutes = require('./server/routes/verify');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/verify', verifyRoutes);

app.get('/api/health', (req, res) => res.json({ success: true }));

const clientDist = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  getDb();
  console.log(`XRPL Anti-Scalping Ticketing — http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  await disconnectClient();
  process.exit(0);
});
