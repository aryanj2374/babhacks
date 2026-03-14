/**
 * XRPL Client Connection Manager
 * Singleton pattern to manage the XRPL WebSocket connection.
 */

const xrpl = require('xrpl');
const config = require('../src/config');

let client = null;

async function getClient() {
  if (!client || !client.isConnected()) {
    client = new xrpl.Client(config.XRPL_SERVER);
    await client.connect();
    console.log('📡 Connected to XRPL Testnet');
  }
  return client;
}

async function disconnectClient() {
  if (client && client.isConnected()) {
    await client.disconnect();
    client = null;
    console.log('📡 Disconnected from XRPL Testnet');
  }
}

module.exports = { getClient, disconnectClient };
