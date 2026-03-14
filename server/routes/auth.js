/**
 * Auth Routes — Signup, Login, Profile
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const router = express.Router();

const { getDb } = require('../db');
const { generateToken, authMiddleware } = require('../auth');
const { encrypt } = require('../crypto');
const { getClient } = require('../xrplClient');
const { createFundedWallet } = require('../../src/wallet');

/**
 * POST /api/auth/signup
 * Body: { email, password, displayName, role }
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName, role } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ success: false, error: 'Email, password, and displayName are required' });
    }

    const userRole = (role === 'organizer') ? 'organizer' : 'fan';
    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    db.prepare(
      'INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, email, passwordHash, userRole, displayName);

    // Create and fund XRPL wallet (testnet faucet)
    const client = await getClient();
    const wallet = await createFundedWallet(client);

    const walletId = uuidv4();
    const encryptedSeed = encrypt(wallet.seed);
    db.prepare(
      'INSERT INTO wallets (id, user_id, xrpl_address, encrypted_seed, funded) VALUES (?, ?, ?, ?, 1)'
    ).run(walletId, userId, wallet.address, encryptedSeed);

    const token = generateToken({ id: userId, email, role: userRole });

    res.json({
      success: true,
      token,
      user: { id: userId, email, role: userRole, displayName, wallet: wallet.address },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const wallet = db.prepare('SELECT xrpl_address FROM wallets WHERE user_id = ?').get(user.id);
    const token = generateToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name, wallet: wallet?.xrpl_address || null },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, email, role, display_name, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const wallet = db.prepare('SELECT xrpl_address FROM wallets WHERE user_id = ?').get(user.id);

    res.json({
      success: true,
      user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name, wallet: wallet?.xrpl_address || null, createdAt: user.created_at },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
