/**
 * Wallet Routes — Balance, Fund RLUSD
 */

const express = require('express');
const router = express.Router();

const { getDb } = require('../db');
const { authMiddleware } = require('../auth');
const { decrypt } = require('../crypto');
const { getClient } = require('../xrplClient');
const { getRLUSDBalance, establishTrustLine, fundRLUSD } = require('../../src/wallet');
const { sleep } = require('../../src/utils');
const xrpl = require('xrpl');

/**
 * GET /api/wallet/balance
 * Returns XRP and RLUSD balances.
 */
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const wallet = db.prepare('SELECT xrpl_address FROM wallets WHERE user_id = ?').get(req.user.id);
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'No wallet found' });
    }

    const client = await getClient();

    // Get XRP balance
    let xrpBalance = '0';
    try {
      const accountInfo = await client.request({
        command: 'account_info',
        account: wallet.xrpl_address,
        ledger_index: 'validated',
      });
      xrpBalance = xrpl.dropsToXrp(accountInfo.result.account_data.Balance);
    } catch (err) {
      // Account might not be activated yet
    }

    // Get RLUSD balance
    const issuerRow = db.prepare("SELECT value FROM platform_config WHERE key = 'issuer_address'").get();
    let rlusdBalance = '0';
    if (issuerRow) {
      rlusdBalance = await getRLUSDBalance(client, wallet.xrpl_address, issuerRow.value);
    }

    res.json({
      success: true,
      address: wallet.xrpl_address,
      balances: {
        xrp: xrpBalance,
        rlusd: rlusdBalance,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/wallet/fund-rlusd
 * Demo faucet: sends RLUSD from platform issuer to user.
 * Body: { amount } (defaults to 1000)
 */
router.post('/fund-rlusd', authMiddleware, async (req, res) => {
  try {
    const amount = req.body.amount || '1000';
    const db = getDb();

    const walletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
    if (!walletRow) {
      return res.status(404).json({ success: false, error: 'No wallet found' });
    }

    const issuerRow = db.prepare("SELECT value FROM platform_config WHERE key = 'issuer_address'").get();
    const issuerSeedRow = db.prepare("SELECT value FROM platform_config WHERE key = 'issuer_seed'").get();
    if (!issuerRow || !issuerSeedRow) {
      return res.status(500).json({ success: false, error: 'Platform issuer not configured. Please restart the server.' });
    }

    const client = await getClient();
    const issuerWallet = xrpl.Wallet.fromSeed(decrypt(issuerSeedRow.value));
    const userWallet = xrpl.Wallet.fromSeed(decrypt(walletRow.encrypted_seed));

    // Ensure trust line exists
    try {
      await establishTrustLine(client, userWallet, issuerRow.value);
      await sleep(500);
    } catch (err) {
      // Trust line might already exist
      if (!err.message.includes('tecDUPLICATE')) {
        console.warn('Trust line warning:', err.message);
      }
    }

    // Send RLUSD
    await fundRLUSD(client, issuerWallet, userWallet, amount);

    // Get updated balance
    const rlusdBalance = await getRLUSDBalance(client, walletRow.xrpl_address, issuerRow.value);

    res.json({
      success: true,
      message: `Funded ${amount} RLUSD`,
      balance: rlusdBalance,
    });
  } catch (err) {
    console.error('Fund RLUSD error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
