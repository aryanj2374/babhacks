/**
 * Centralized royalty calculation for OpenTix.
 *
 * Royalty model (flat percentage of every resale):
 *   royalty    = resalePrice × royaltyPercent / 100
 *   sellerNet  = resalePrice − royalty
 *   buyerPays  = resalePrice  (no surcharge)
 *   organizer  = royalty      (via separate XRPL Payment from seller)
 *
 * Example A: resalePrice = 200 XRP, royaltyPercent = 10%
 *   buyerPays   = 200 XRP
 *   royalty     = 20 XRP     → organizer receives
 *   sellerNet   = 180 XRP    → seller receives
 *
 * Example B: resalePrice = 75 XRP, royaltyPercent = 5%
 *   buyerPays   = 75 XRP
 *   royalty     = 3.75 XRP   → organizer receives
 *   sellerNet   = 71.25 XRP  → seller receives
 */

/**
 * Calculate royalty amounts for a ticket resale.
 *
 * @param {string|number} resalePriceXrp - The listed resale price in XRP
 * @param {number}        royaltyPercent  - The organizer's royalty rate (0–50)
 * @returns {{
 *   buyerPays:      number,
 *   royaltyXrp:     number,
 *   royaltyDrops:   number,
 *   sellerNet:      number,
 *   royaltyPercent: number,
 * }}
 */
function calculateRoyalty(resalePriceXrp, royaltyPercent) {
  const resale = parseFloat(resalePriceXrp) || 0;
  const pct = Math.max(0, Math.min(50, parseFloat(royaltyPercent) || 0));

  const royaltyXrp = resale * pct / 100;
  // Convert to drops (1 XRP = 1,000,000 drops); floor to avoid fractional drops
  const royaltyDrops = Math.floor(royaltyXrp * 1_000_000);
  // Recompute from drops so displayed values match what's actually sent on-chain
  const royaltyActual = royaltyDrops / 1_000_000;
  const sellerNet = resale - royaltyActual;

  return {
    buyerPays: resale,
    royaltyXrp: royaltyActual,
    royaltyDrops,
    sellerNet,
    royaltyPercent: pct,
  };
}

module.exports = { calculateRoyalty };
