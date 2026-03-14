/**
 * Configuration for XRPL Anti-Scalping Ticketing System
 * 
 * XRPL Primitives used:
 *   - Testnet WebSocket for development/demo
 *   - Custom issued currency (simulating RLUSD stablecoin)
 *   - NFTokenTaxon for grouping tickets by event
 */

module.exports = {
  // XRPL Testnet WebSocket endpoint
  XRPL_SERVER: 'wss://s.altnet.rippletest.net:51233',

  // Simulated RLUSD currency code (3-char ISO style)
  // On mainnet this would be the real RLUSD issuer; on testnet we self-issue
  RLUSD_CURRENCY: 'USD',

  // Default royalty percentage for organizers (in basis points, max 50000 = 50%)
  // This maps to XRPL's NFTokenMint TransferFee field
  DEFAULT_ROYALTY_BPS: 1000, // 10% royalty on every resale

  // NFTokenTaxon — used to group all tickets for a single event
  DEFAULT_TAXON: 1,

  // Trust line limit for RLUSD
  TRUST_LINE_LIMIT: '1000000',

  // Explorer base URL for verifying transactions
  EXPLORER_URL: 'https://testnet.xrpl.org',
};
