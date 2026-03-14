/**
 * Wallet & RLUSD Management for XRPL Anti-Scalping Ticketing System
 * 
 * XRPL Primitives used:
 *   - Testnet Faucet for funding wallets (fundWallet)
 *   - TrustSet transaction to establish trust lines for IOU tokens
 *   - Payment transaction to transfer issued currency (simulated RLUSD)
 * 
 * On XRPL, custom tokens (IOUs) require:
 *   1. An issuer account that creates the token
 *   2. Recipient accounts must set a TrustLine to the issuer before receiving
 *   3. The issuer sends Payment transactions to distribute tokens
 */

const xrpl = require('xrpl');
const config = require('./config');

/**
 * Create and fund a new wallet on XRPL Testnet.
 * Uses the built-in faucet to get test XRP.
 * 
 * XRPL Primitive: Testnet Faucet (fundWallet)
 * 
 * @param {Client} client - Connected xrpl.Client instance
 * @returns {Wallet} Funded XRPL wallet
 */
async function createFundedWallet(client) {
  const { wallet } = await client.fundWallet();
  console.log(`  ✅ Funded wallet: ${wallet.address}`);
  return wallet;
}

/**
 * Establish a trust line from a wallet to an issuer for RLUSD.
 * Without a trust line, an account cannot hold the issued token.
 * 
 * XRPL Primitive: TrustSet transaction
 * - Sets the maximum amount of the token this account is willing to hold
 * - Required before any IOU token can be received
 * 
 * @param {Client} client - Connected xrpl.Client instance
 * @param {Wallet} wallet - The wallet that will hold RLUSD
 * @param {string} issuerAddress - The RLUSD issuer's account address
 */
async function establishTrustLine(client, wallet, issuerAddress) {
  const trustSetTx = {
    TransactionType: 'TrustSet',
    Account: wallet.address,
    LimitAmount: {
      currency: config.RLUSD_CURRENCY,
      issuer: issuerAddress,
      value: config.TRUST_LINE_LIMIT,
    },
  };

  const result = await client.submitAndWait(trustSetTx, { wallet });
  const txResult = result.result.meta.TransactionResult;
  if (txResult !== 'tesSUCCESS') {
    throw new Error(`TrustSet failed: ${txResult}`);
  }
  console.log(`  ✅ Trust line established: ${wallet.address} → ${issuerAddress}`);
  return result;
}

/**
 * Send RLUSD (simulated stablecoin) from the issuer to a destination wallet.
 * The issuer can create tokens by simply sending a Payment to a trusted account.
 * 
 * XRPL Primitive: Payment transaction (IOU)
 * - When the issuer sends an IOU, it creates new tokens (issuance)
 * - When non-issuers send IOUs, it transfers existing tokens
 * 
 * @param {Client} client - Connected xrpl.Client
 * @param {Wallet} issuerWallet - The RLUSD issuer wallet
 * @param {Wallet} destWallet - Destination wallet (must have trust line)
 * @param {string} amount - Amount of RLUSD to send
 */
async function fundRLUSD(client, issuerWallet, destWallet, amount) {
  const paymentTx = {
    TransactionType: 'Payment',
    Account: issuerWallet.address,
    Destination: destWallet.address,
    Amount: {
      currency: config.RLUSD_CURRENCY,
      issuer: issuerWallet.address,
      value: amount,
    },
  };

  const result = await client.submitAndWait(paymentTx, { wallet: issuerWallet });
  const txResult = result.result.meta.TransactionResult;
  if (txResult !== 'tesSUCCESS') {
    throw new Error(`RLUSD Payment failed: ${txResult}`);
  }
  console.log(`  ✅ Sent ${amount} RLUSD to ${destWallet.address}`);
  return result;
}

/**
 * Get the RLUSD balance for a given wallet.
 * Uses the gateway_balances or account_lines RPC.
 * 
 * @param {Client} client - Connected xrpl.Client
 * @param {string} address - Wallet address to check
 * @param {string} issuerAddress - The RLUSD issuer address
 * @returns {string} RLUSD balance as string
 */
async function getRLUSDBalance(client, address, issuerAddress) {
  try {
    const response = await client.request({
      command: 'account_lines',
      account: address,
      peer: issuerAddress,
    });
    const line = (response.result.lines || []).find(
      l => l.currency === config.RLUSD_CURRENCY
    );
    return line ? line.balance : '0';
  } catch {
    return '0';
  }
}

module.exports = {
  createFundedWallet,
  establishTrustLine,
  fundRLUSD,
  getRLUSDBalance,
};
