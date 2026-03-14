/**
 * Auth Routes — Signup, Login, Profile
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { generateToken, authMiddleware } = require('../auth');
const { encrypt } = require('../crypto');
const { getClient } = require('../xrplClient');
const { createFundedWallet } = require('../../src/wallet');
const MongoUser = require('../models/User');
const logger = require('../logger');

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

    const existing = await MongoUser.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create and fund XRPL wallet (testnet faucet)
    const client = await getClient();
    const wallet = await createFundedWallet(client);
    const encryptedSeed = encrypt(wallet.seed);

    const user = await MongoUser.create({
      email: email.toLowerCase(),
      passwordHash,
      role: userRole,
      displayName,
      xrplAddress: wallet.address,
      xrplSeed: encryptedSeed,
    });

    const token = generateToken({ id: user._id.toString(), email: user.email, role: userRole });

    logger.info('AUTH', `Signup: ${email} (${userRole}) wallet=${wallet.address.slice(0, 12)}…`);

    res.json({
      success: true,
      token,
      user: { id: user._id.toString(), email: user.email, role: userRole, displayName, wallet: wallet.address },
    });
  } catch (err) {
    logger.error('AUTH signup', err);
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

    const user = await MongoUser.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = generateToken({ id: user._id.toString(), email: user.email, role: user.role });

    res.json({
      success: true,
      token,
      user: { id: user._id.toString(), email: user.email, role: user.role, displayName: user.displayName, wallet: user.xrplAddress || null },
    });
    logger.info('AUTH', `Login: ${email} (${user.role})`);
  } catch (err) {
    logger.error('AUTH login', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await MongoUser.findById(req.user.id).select('-passwordHash -xrplSeed');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        wallet: user.xrplAddress || null,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
