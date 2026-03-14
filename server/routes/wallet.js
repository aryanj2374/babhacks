/**
 * Wallet Routes — Balance, Refill XRP
 */

const express = require('express');
const xrpl = require('xrpl');
const router = express.Router();

const { authMiddleware } = require('../auth');
const { decrypt } = require('../crypto');
const { getClient } = require('../xrplClient');
const { refillWallet } = require('../../src/wallet');
const MongoUser = require('../models/User');

/**
 * GET /api/wallet/balance
 * Returns XRP balance and wallet address.
 */
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const user = await MongoUser.findById(req.user.id);
    if (!user || !user.xrplAddress) return res.status(404).json({ success: false, error: 'No wallet found' });

    const client = await getClient();
    let xrpBalance = '0';
    try {
      const accountInfo = await client.request({
        command: 'account_info',
        account: user.xrplAddress,
        ledger_index: 'validated',
      });
      xrpBalance = xrpl.dropsToXrp(accountInfo.result.account_data.Balance);
    } catch {
      // Account not activated yet
    }

    res.json({
      success: true,
      address: user.xrplAddress,
      balances: { xrp: xrpBalance },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/wallet/fund-xrp
 * Refills wallet from the XRPL Testnet faucet.
 */
router.post('/fund-xrp', authMiddleware, async (req, res) => {
  try {
    const user = await MongoUser.findById(req.user.id);
    if (!user || !user.xrplSeed) return res.status(404).json({ success: false, error: 'No wallet found' });

    const client = await getClient();
    const userWallet = xrpl.Wallet.fromSeed(decrypt(user.xrplSeed));
    await refillWallet(client, userWallet);

    let xrpBalance = '0';
    try {
      const accountInfo = await client.request({
        command: 'account_info',
        account: user.xrplAddress,
        ledger_index: 'validated',
      });
      xrpBalance = xrpl.dropsToXrp(accountInfo.result.account_data.Balance);
    } catch {}

    res.json({ success: true, message: 'Wallet refilled with Testnet XRP', balance: xrpBalance });
  } catch (err) {
    console.error('Fund XRP error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
