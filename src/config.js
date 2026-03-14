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

  // Default royalty for organizers mapped to XRPL TransferFee units.
  // XRPL scale: 50000 = 50%, 10000 = 10%, 1000 = 1%, 1 = 0.001%.
  // Formula: percent * 1000 (so 10% → 10000).
  DEFAULT_ROYALTY_BPS: 10000, // 10% royalty on every resale

  // NFTokenTaxon — used to group all tickets for a single event
  DEFAULT_TAXON: 1,

  // Trust line limit for RLUSD
  TRUST_LINE_LIMIT: '1000000',

  // Explorer base URL for verifying transactions
  EXPLORER_URL: 'https://testnet.xrpl.org',
};
