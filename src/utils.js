/**
 * Utility functions for OpenTix Ticketing Platform
 * 
 * Handles:
 *   - Metadata encoding/decoding (JSON ↔ hex for NFT URIs)
 *   - NFT token fetching via account_nfts RPC
 *   - Resale tracking via metadata
 */

/**
 * Encode a JavaScript object as a hex string for use as an NFT URI.
 * XRPL NFT URIs are stored as hex-encoded strings.
 * 
 * @param {Object} metadata - Ticket metadata (eventId, seat, price, etc.)
 * @returns {string} Hex-encoded JSON string
 */
function encodeMetadata(metadata) {
  const json = JSON.stringify(metadata);
  return Buffer.from(json, 'utf8').toString('hex').toUpperCase();
}

/**
 * Decode a hex-encoded NFT URI back to a JavaScript object.
 * 
 * @param {string} hex - Hex-encoded string from NFT URI field
 * @returns {Object} Parsed metadata object
 */
function decodeMetadata(hex) {
  const json = Buffer.from(hex, 'hex').toString('utf8');
  return JSON.parse(json);
}

/**
 * Fetch all NFTs owned by a given XRPL account.
 * Uses the `account_nfts` RPC method (XLS-20 primitive).
 * 
 * @param {Client} client - Connected xrpl.Client instance
 * @param {string} address - XRPL account address (r...)
 * @returns {Array} Array of NFToken objects
 */
async function getNFTokens(client, address) {
  const response = await client.request({
    command: 'account_nfts',
    account: address,
    limit: 100,
  });
  return response.result.account_nfts || [];
}

/**
 * Find a specific NFT by its NFTokenID in an account's inventory.
 * 
 * @param {Client} client - Connected xrpl.Client instance
 * @param {string} address - XRPL account address
 * @param {string} tokenId - NFTokenID to search for
 * @returns {Object|null} The NFToken object if found, null otherwise
 */
async function findNFToken(client, address, tokenId) {
  const nfts = await getNFTokens(client, address);
  return nfts.find(nft => nft.NFTokenID === tokenId) || null;
}

/**
 * Get all sell offers for a specific NFToken.
 * Uses the `nft_sell_offers` RPC method.
 * 
 * @param {Client} client - Connected xrpl.Client instance
 * @param {string} tokenId - NFTokenID
 * @returns {Array} Array of sell offer objects
 */
async function getSellOffers(client, tokenId) {
  try {
    const response = await client.request({
      command: 'nft_sell_offers',
      nft_id: tokenId,
    });
    return response.result.offers || [];
  } catch (err) {
    // No offers exist yet
    if (err.data?.error === 'objectNotFound') return [];
    throw err;
  }
}

/**
 * Get all buy offers for a specific NFToken.
 * Uses the `nft_buy_offers` RPC method.
 * 
 * @param {Client} client - Connected xrpl.Client instance
 * @param {string} tokenId - NFTokenID
 * @returns {Array} Array of buy offer objects
 */
async function getBuyOffers(client, tokenId) {
  try {
    const response = await client.request({
      command: 'nft_buy_offers',
      nft_id: tokenId,
    });
    return response.result.offers || [];
  } catch (err) {
    if (err.data?.error === 'objectNotFound') return [];
    throw err;
  }
}

/**
 * Convert a human-readable amount to XRPL drops (for XRP)
 * or return an IOU amount object (for tokens like RLUSD).
 * 
 * @param {string} amount - Amount as string (e.g. "100")
 * @param {string} currency - Currency code (e.g. "USD")
 * @param {string} issuer - Issuer address for IOU tokens
 * @returns {Object|string} XRPL amount object
 */
function toXRPLAmount(amount, currency, issuer) {
  if (currency === 'XRP') {
    return xrpl.xrpToDrops(amount);
  }
  return {
    currency,
    issuer,
    value: amount,
  };
}

/**
 * Sleep helper for rate limiting XRPL requests.
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  encodeMetadata,
  decodeMetadata,
  getNFTokens,
  findNFToken,
  getSellOffers,
  getBuyOffers,
  toXRPLAmount,
  sleep,
};
