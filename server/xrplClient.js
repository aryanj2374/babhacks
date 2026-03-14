/**
 * XRPL Client Connection Manager
 * Singleton pattern to manage the XRPL WebSocket connection.
 *
 * Reconnects automatically when the connection goes stale. A stale connection
 * causes autofill() to use an outdated ledger index, which sets a
 * LastLedgerSequence that has already passed — resulting in temMALFORMED.
 */

const xrpl = require('xrpl');
const config = require('../src/config');

let client = null;
let connectedAt = null;

// Reconnect after 5 minutes of idle time.
// The LastLedgerSequence staleness issue is now handled inside submitWithBuffer
// via a fresh ledger_current RPC call, so we only need to reconnect here to
// prevent dead WebSocket connections — not for ledger freshness.
// Keeping this window long prevents disconnecting a client mid-operation
// (e.g., while submitAndWait is polling for transaction confirmation).
const MAX_CONNECTION_AGE_MS = 5 * 60 * 1000;

async function getClient() {
  const isStale = connectedAt && (Date.now() - connectedAt > MAX_CONNECTION_AGE_MS);

  if (client && client.isConnected() && !isStale) {
    return client;
  }

  if (client && client.isConnected()) {
    await client.disconnect();
  }

  client = new xrpl.Client(config.XRPL_SERVER);
  await client.connect();
  connectedAt = Date.now();
  console.log('📡 Connected to XRPL Testnet');
  return client;
}

async function disconnectClient() {
  if (client && client.isConnected()) {
    await client.disconnect();
    client = null;
    connectedAt = null;
    console.log('📡 Disconnected from XRPL Testnet');
  }
}

module.exports = { getClient, disconnectClient };
