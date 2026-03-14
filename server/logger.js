/**
 * Debug Logger
 *
 * Structured logging for XRPL ticketing operations.
 * Writes to:
 *   - console (color-coded)
 *   - logs/debug.log (timestamped, append-only)
 */

const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
const LOG_FILE = path.join(LOGS_DIR, 'debug.log');

// ANSI colors
const COLORS = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  red:     '\x1b[31m',
  bold:    '\x1b[1m',
};

function timestamp() {
  return new Date().toISOString();
}

function writeToFile(entry) {
  const line = `[${timestamp()}] ${entry}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

function formatKV(data) {
  return Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 40 ? v.slice(0, 37) + '...' : v}`)
    .join(' | ');
}

const logger = {
  /**
   * Log a minting operation.
   */
  mint(data) {
    const { eventId, ticketIds, organizerAddress, eventName, txHash } = data;
    const ids = Array.isArray(ticketIds)
      ? ticketIds.map(t => t.slice(0, 16) + '…').join(', ')
      : ticketIds;
    const msg = `MINT eventId=${eventId} organizer=${organizerAddress?.slice(0, 12)}… tickets=[${ids}]`;
    console.log(`${COLORS.green}${COLORS.bold}🎫 [MINT]${COLORS.reset} ${COLORS.green}${msg}${COLORS.reset}`);
    writeToFile(`[MINT] ${formatKV({ eventId, eventName: eventName || '', organizerAddress, ticketCount: Array.isArray(ticketIds) ? ticketIds.length : 1, txHash: txHash || '' })}`);
  },

  /**
   * Log a ticket purchase.
   */
  buy(data) {
    const { buyerAddress, ticketId, amount, txHash } = data;
    const msg = `BUY buyer=${buyerAddress?.slice(0, 12)}… ticket=${ticketId?.slice(0, 16)}… amount=${amount} XRP tx=${txHash?.slice(0, 16)}…`;
    console.log(`${COLORS.blue}${COLORS.bold}🛒 [BUY]${COLORS.reset} ${COLORS.blue}${msg}${COLORS.reset}`);
    writeToFile(`[BUY] ${formatKV(data)}`);
  },

  /**
   * Log a ticket resale.
   */
  resell(data) {
    const { sellerAddress, ticketId, resalePrice, txHash, royaltyPaid } = data;
    const msg = `RESELL seller=${sellerAddress?.slice(0, 12)}… ticket=${ticketId?.slice(0, 16)}… price=${resalePrice} XRP royalty=${royaltyPaid || 'N/A'} tx=${txHash?.slice(0, 16)}…`;
    console.log(`${COLORS.yellow}${COLORS.bold}🔄 [RESELL]${COLORS.reset} ${COLORS.yellow}${msg}${COLORS.reset}`);
    writeToFile(`[RESELL] ${formatKV(data)}`);
  },

  /**
   * Log a general info message.
   */
  info(source, msg) {
    console.log(`${COLORS.cyan}ℹ️  [${source}]${COLORS.reset} ${msg}`);
    writeToFile(`[INFO] [${source}] ${msg}`);
  },

  /**
   * Log an error.
   */
  error(source, err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? `\n${err.stack}` : '';
    console.error(`${COLORS.red}${COLORS.bold}❌ [ERROR] [${source}]${COLORS.reset} ${COLORS.red}${msg}${COLORS.reset}`);
    writeToFile(`[ERROR] [${source}] ${msg}${stack}`);
  },

  /**
   * Log a MongoDB sync operation.
   */
  mongoSync(collection, action, id) {
    const msg = `${collection}.${action} id=${id}`;
    console.log(`${COLORS.magenta}🗄️  [MONGO]${COLORS.reset} ${COLORS.dim}${msg}${COLORS.reset}`);
    writeToFile(`[MONGO] ${msg}`);
  },
};

module.exports = logger;
