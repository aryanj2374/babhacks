const xrpl = require('xrpl');

/**
 * Create and fund a new wallet on XRPL Testnet via the built-in faucet.
 */
async function createFundedWallet(client) {
  const { wallet } = await client.fundWallet();
  console.log(`  Funded wallet: ${wallet.address}`);
  return wallet;
}

/**
 * Refill an existing wallet from the testnet faucet.
 */
async function refillWallet(client, wallet) {
  const { wallet: refilled } = await client.fundWallet(wallet);
  console.log(`  Refilled wallet: ${refilled.address}`);
  return refilled;
}

module.exports = { createFundedWallet, refillWallet };
