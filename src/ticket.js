/**
 * Core Ticketing Logic for OpenTix
 * 
 * This module implements the four main functions:
 *   1. mintTicket   — Organizer creates an NFT ticket (XLS-20 NFTokenMint)
 *   2. buyTicket    — Fan purchases a ticket (NFTokenCreateOffer + NFTokenAcceptOffer)
 *   3. resellTicket — Fan resells with OpenTix enforcement
 *   4. verifyTicket — Ownership & validity check (account_nfts)
 * 
 * XRPL Primitives used:
 *   - NFTokenMint: Creates a new NFT on the ledger
 *   - NFTokenCreateOffer: Creates a buy or sell offer for an NFT
 *   - NFTokenAcceptOffer: Accepts an existing offer, completing the trade
 *   - TransferFee: Built-in royalty mechanism (paid to original minter on every resale)
 *   - account_nfts: Query an account's NFT inventory
 * 
 * OpenTix Enforcement:
 *   - Max resale price is encoded in NFT metadata and checked before creating offers
 *   - Royalties are automatically handled by XRPL's TransferFee (up to 50%)
 */

const xrpl = require('xrpl');
const config = require('./config');
const { encodeMetadata, decodeMetadata, getNFTokens, findNFToken, getSellOffers } = require('./utils');

/**
 * Submit a transaction and wait for validation.
 *
 * Uses autofill for Sequence and Fee, but then overwrites LastLedgerSequence
 * with a fresh ledger_current RPC call + 100 ledger buffer. This bypasses any
 * stale cached ledger index that autofill may hold, which is the root cause of
 * "LastLedgerSequence < current ledger" (temMALFORMED) errors.
 */
async function submitWithBuffer(client, tx, wallet) {
  // Autofill fills Sequence, Fee, NetworkID. It also sets LastLedgerSequence
  // to validated+20, but we immediately override that below.
  const prepared = await client.autofill(tx);

  // Base LastLedgerSequence on getLedgerIndex() — the validated ledger — because
  // that is the exact same value the xrpl.js polling loop compares against.
  // Using ledger_current (open ledger) causes spurious expiry on the testnet
  // when the two indexes diverge.
  const validatedLedger = await client.getLedgerIndex();
  prepared.LastLedgerSequence = validatedLedger + 100;

  const { tx_blob, hash } = wallet.sign(prepared);

  // Submit immediately and inspect the preliminary engine result.
  const submitRes = await client.request({ command: 'submit', tx_blob });
  const engineResult = submitRes.result.engine_result;

  // tem/tef/tel errors mean the transaction is permanently invalid — throw fast
  // instead of polling for 400+ seconds waiting for LLS to expire.
  if (
    engineResult.startsWith('tem') ||
    engineResult.startsWith('tef') ||
    engineResult.startsWith('tel')
  ) {
    throw new Error(
      `Transaction rejected: ${engineResult} — ${submitRes.result.engine_result_message}`
    );
  }

  // Poll for validation with a hard 60-second wall-clock timeout.
  // tesSUCCESS / terQUEUED / ter* are all pending states that need polling.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));

    // If LLS has passed we can stop — the tx will never land.
    const currentLedger = await client.getLedgerIndex();
    if (currentLedger > prepared.LastLedgerSequence) {
      throw new Error(
        `Transaction expired after LLS passed. Preliminary: ${engineResult}`
      );
    }

    try {
      const txRes = await client.request({ command: 'tx', transaction: hash });
      if (txRes.result.validated) {
        return txRes; // same shape as submitAndWait return value
      }
    } catch (e) {
      // txnNotFound is normal while waiting — ignore and keep polling
      if (e?.data?.error !== 'txnNotFound') throw e;
    }
  }

  throw new Error('Transaction not validated within 60 seconds');
}

// ═══════════════════════════════════════════════════════════════════
// 1. MINT TICKET
// ═══════════════════════════════════════════════════════════════════

/**
 * Mint a new event ticket as an NFT on XRPL.
 * 
 * XRPL Primitive: NFTokenMint (XLS-20)
 * 
 * The NFT is created with:
 *   - URI: Hex-encoded JSON metadata containing event details
 *   - Flags: tfTransferable (8) — allows the NFT to be traded on secondary market
 *            tfBurnable (1) — allows the issuer to burn expired tickets
 *   - TransferFee: Royalty percentage in basis points (e.g., 1000 = 10%)
 *     → This is XRPL-native: the minter automatically receives this % on EVERY resale
 *   - NFTokenTaxon: Groups tickets by event for easy querying
 * 
 * @param {Client} client - Connected xrpl.Client
 * @param {Wallet} organizerWallet - The event organizer's wallet (becomes the NFT minter)
 * @param {Object} metadata - Ticket metadata:
 *   @param {string} metadata.eventId - Unique event identifier
 *   @param {string} metadata.eventName - Human-readable event name
 *   @param {string} metadata.seat - Seat identifier (e.g., "A-101")
 *   @param {string} metadata.originalPrice - Face value in XRP
 *   @param {string} metadata.maxResalePrice - Maximum allowed resale price in XRP
 *   @param {string} metadata.eventDate - Event date (ISO format)
 *   @param {number} metadata.maxResales - Maximum number of resales allowed (0 = unlimited)
 *   @param {number} [metadata.resaleCount=0] - Current resale count (starts at 0)
 * @returns {Object} { tokenId, txHash, metadata }
 */
async function mintTicket(client, organizerWallet, metadata, royaltyBps = config.DEFAULT_ROYALTY_BPS) {
  // Ensure resaleCount starts at 0
  const fullMetadata = {
    ...metadata,
    resaleCount: 0,
    minter: organizerWallet.address,
    mintedAt: new Date().toISOString(),
  };

  // XRPL NFT URI hard limit: 256 bytes (512 hex chars).
  // minter (34-char address) and mintedAt (24-char timestamp) are already
  // recorded on-chain in the transaction itself, so we exclude them from
  // the URI to stay well under the byte limit.
  const { minter: _m, mintedAt: _t, ...uriMetadata } = { ...fullMetadata, royaltyBps };
  const uri = encodeMetadata(uriMetadata);

  // Build the NFTokenMint transaction
  const mintTx = {
    TransactionType: 'NFTokenMint',
    Account: organizerWallet.address,
    URI: uri,
    // Flags: tfTransferable (8) + tfBurnable (1) = 9
    Flags: 8 + 1,
    // TransferFee: 0 — royalty is enforced at the application layer.
    // XRPL's built-in TransferFee adds the fee ON TOP of the sale price (buyer pays
    // extra), which is not the desired UX. Instead, we calculate profit-based royalty
    // in resellTicket() and send a separate Payment from the seller to the organizer.
    TransferFee: 0,
    NFTokenTaxon: config.DEFAULT_TAXON,
  };

  const result = await submitWithBuffer(client, mintTx, organizerWallet);
  const txResult = result.result.meta.TransactionResult;
  if (txResult !== 'tesSUCCESS') {
    throw new Error(`NFTokenMint failed: ${txResult}`);
  }

  // Extract the NFTokenID from the transaction metadata
  // The token ID is found in the AffectedNodes of the transaction
  const tokenId = extractTokenId(result);

  console.log(`  Minted ticket NFT: ${tokenId} | Event: ${fullMetadata.eventName} | Seat: ${fullMetadata.seat}`);

  return {
    tokenId,
    txHash: result.result.hash,
    metadata: fullMetadata,
  };
}

/**
 * Extract the newly minted NFTokenID from a mint transaction result.
 * Looks through AffectedNodes for the NFTokenPage changes.
 */
function extractTokenId(result) {
  const meta = result.result.meta;
  const affectedNodes = meta.AffectedNodes || [];

  for (const node of affectedNodes) {
    const created = node.CreatedNode;
    const modified = node.ModifiedNode;

    if (created && created.LedgerEntryType === 'NFTokenPage') {
      const tokens = created.NewFields?.NFTokens || [];
      if (tokens.length > 0) {
        return tokens[tokens.length - 1].NFToken.NFTokenID;
      }
    }

    if (modified && modified.LedgerEntryType === 'NFTokenPage') {
      const prevTokens = modified.PreviousFields?.NFTokens || [];
      const finalTokens = modified.FinalFields?.NFTokens || [];
      // The new token is in FinalFields but not in PreviousFields
      const prevIds = new Set(prevTokens.map(t => t.NFToken.NFTokenID));
      for (const t of finalTokens) {
        if (!prevIds.has(t.NFToken.NFTokenID)) {
          return t.NFToken.NFTokenID;
        }
      }
    }
  }

  throw new Error('Could not extract NFTokenID from mint transaction');
}


// ═══════════════════════════════════════════════════════════════════
// 2. BUY TICKET (Primary Sale)
// ═══════════════════════════════════════════════════════════════════

/**
 * Buy a ticket (primary sale: organizer → fan).
 *
 * Amount is native XRP in drops (1 XRP = 1,000,000 drops).
 * xrpl.xrpToDrops("50") → "50000000"
 *
 * @param {Client} client
 * @param {Wallet} buyerWallet
 * @param {Wallet} sellerWallet
 * @param {string} tokenId - NFTokenID
 * @param {string} price   - Price in XRP (e.g. "50")
 * @returns {Object} { txHash, tokenId, price, sellOfferId }
 */
async function buyTicket(client, buyerWallet, sellerWallet, tokenId, price) {
  // Convert XRP → drops (string). XRPL requires Amount as drops string, NOT raw XRP.
  const amountDrops = xrpl.xrpToDrops(String(price));

  console.log(`[XRPL] NFTokenCreateOffer (buy) | tokenId=${tokenId.slice(0, 16)}… | amount=${amountDrops} drops (${price} XRP) | seller=${sellerWallet.address.slice(0, 12)}… | buyer=${buyerWallet.address.slice(0, 12)}…`);

  // Step 1: Seller creates a sell offer priced in XRP drops
  const sellOfferTx = {
    TransactionType: 'NFTokenCreateOffer',
    Account: sellerWallet.address,
    NFTokenID: tokenId,
    Amount: amountDrops,       // ← drops string, e.g. "50000000"
    Destination: buyerWallet.address,
    Flags: 1,                  // tfSellNFToken
  };

  const sellResult = await submitWithBuffer(client, sellOfferTx, sellerWallet);
  if (sellResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Sell offer failed: ${sellResult.result.meta.TransactionResult}`);
  }

  const sellOfferId = extractOfferId(sellResult);
  console.log(`[XRPL] Sell offer created: ${sellOfferId}`);

  // Step 2: Buyer accepts — XRPL atomically transfers NFT + XRP payment + royalty
  const acceptTx = {
    TransactionType: 'NFTokenAcceptOffer',
    Account: buyerWallet.address,
    NFTokenSellOffer: sellOfferId,
  };

  const acceptResult = await submitWithBuffer(client, acceptTx, buyerWallet);
  if (acceptResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Accept offer failed: ${acceptResult.result.meta.TransactionResult}`);
  }

  console.log(`[XRPL] Ticket purchased! NFT ${tokenId.slice(0, 16)}… → ${buyerWallet.address.slice(0, 12)}…`);

  return {
    txHash: acceptResult.result.hash,
    tokenId,
    price,
    sellOfferId,
  };
}


// ═══════════════════════════════════════════════════════════════════
// 3. RESELL TICKET (Secondary Market with OpenTix Enforcement)
// ═══════════════════════════════════════════════════════════════════

/**
 * Resell a ticket on the secondary market with OpenTix enforcement.
 *
 * Royalty model (application-layer, profit-based):
 *   profit       = max(0, resalePrice - sellerPaidPrice)
 *   royalty      = profit * (royaltyBps / 100000)
 *   seller nets  = resalePrice - royalty
 *   organizer    = +royalty  (via separate Payment tx from seller)
 *   buyer pays   = resalePrice (no extra fee on top)
 *
 * @param {Client} client
 * @param {Wallet} sellerWallet
 * @param {Wallet} buyerWallet
 * @param {string} tokenId        - NFTokenID
 * @param {string} resalePrice    - Price in XRP (e.g. "45")
 * @param {Object} ticketMetadata - { maxResalePrice, eventDate, royaltyBps, sellerPaidPrice, organizerAddress }
 * @returns {Object} { txHash, tokenId, resalePrice, royaltyPaid }
 */
async function resellTicket(client, sellerWallet, buyerWallet, tokenId, resalePrice, ticketMetadata) {
  // ── OpenTix Check 1: Max Resale Price ──
  const maxPrice = parseFloat(ticketMetadata.maxResalePrice);
  const proposedPrice = parseFloat(resalePrice);
  if (proposedPrice > maxPrice) {
    throw new Error(
      `OpenTix: resale price ${resalePrice} XRP exceeds maximum of ${ticketMetadata.maxResalePrice} XRP`
    );
  }

  // ── OpenTix Check 2: Event Date Validity ──
  const eventDate = new Date(ticketMetadata.eventDate);
  if (eventDate < new Date()) {
    throw new Error(`Ticket's event has already passed (${ticketMetadata.eventDate})`);
  }

  // ── Profit-based royalty calculation ──
  const sellerPaidPrice = parseFloat(ticketMetadata.sellerPaidPrice || '0');
  const profit = Math.max(0, proposedPrice - sellerPaidPrice);
  const royaltyBps = ticketMetadata.royaltyBps ?? config.DEFAULT_ROYALTY_BPS;
  const royaltyXrp = profit * royaltyBps / 100000;
  const royaltyDrops = Math.floor(royaltyXrp * 1_000_000);

  const amountDrops = xrpl.xrpToDrops(String(resalePrice));

  console.log(`[XRPL] NFTokenCreateOffer (resell) | tokenId=${tokenId.slice(0, 16)}… | amount=${amountDrops} drops (${resalePrice} XRP) | profit=${profit} XRP | royalty=${royaltyXrp} XRP`);

  // Step 1: Seller creates sell offer (buyer pays exact resalePrice — no TransferFee surcharge)
  const sellOfferTx = {
    TransactionType: 'NFTokenCreateOffer',
    Account: sellerWallet.address,
    NFTokenID: tokenId,
    Amount: amountDrops,
    Destination: buyerWallet.address,
    Flags: 1, // tfSellNFToken
  };

  const sellResult = await submitWithBuffer(client, sellOfferTx, sellerWallet);
  if (sellResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Resale sell offer failed: ${sellResult.result.meta.TransactionResult}`);
  }

  const sellOfferId = extractOfferId(sellResult);
  console.log(`[XRPL] Resale sell offer created: ${sellOfferId}`);

  // Step 2: Buyer accepts — atomic NFT + XRP swap; seller receives full resalePrice
  const acceptTx = {
    TransactionType: 'NFTokenAcceptOffer',
    Account: buyerWallet.address,
    NFTokenSellOffer: sellOfferId,
  };

  const acceptResult = await submitWithBuffer(client, acceptTx, buyerWallet);
  if (acceptResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Resale accept failed: ${acceptResult.result.meta.TransactionResult}`);
  }

  console.log(`[XRPL] Ticket resold! NFT ${tokenId.slice(0, 16)}… → ${buyerWallet.address.slice(0, 12)}…`);

  // Step 3: Seller pays profit-based royalty to organizer
  let royaltyPaid = '0';
  let royaltyError = null;

  console.log(`[XRPL] Royalty check: profit=${profit} XRP, royaltyXrp=${royaltyXrp}, royaltyDrops=${royaltyDrops}, organizerAddress=${ticketMetadata.organizerAddress || 'MISSING'}, sellerPaidPrice=${sellerPaidPrice}`);

  if (royaltyDrops > 0 && ticketMetadata.organizerAddress) {
    console.log(`[XRPL] Sending royalty ${royaltyXrp} XRP (${royaltyDrops} drops) from seller ${sellerWallet.address.slice(0, 12)}… → organizer ${ticketMetadata.organizerAddress.slice(0, 12)}…`);
    const royaltyTx = {
      TransactionType: 'Payment',
      Account: sellerWallet.address,
      Destination: ticketMetadata.organizerAddress,
      Amount: royaltyDrops.toString(),
    };

    try {
      const royaltyResult = await submitWithBuffer(client, royaltyTx, sellerWallet);
      if (royaltyResult.result.meta.TransactionResult === 'tesSUCCESS') {
        royaltyPaid = royaltyXrp.toFixed(6);
        console.log(`[XRPL] ✅ Royalty paid: ${royaltyPaid} XRP → organizer`);
      } else {
        royaltyError = `Royalty tx failed: ${royaltyResult.result.meta.TransactionResult}`;
        console.error(`[XRPL] ❌ ${royaltyError}`);
      }
    } catch (err) {
      royaltyError = `Royalty tx error: ${err.message}`;
      console.error(`[XRPL] ❌ ${royaltyError}`);
    }
  } else if (royaltyDrops <= 0) {
    console.log(`[XRPL] No royalty due (profit=${profit}, royaltyDrops=${royaltyDrops})`);
  } else {
    royaltyError = 'organizerAddress is missing — cannot send royalty';
    console.error(`[XRPL] ❌ ${royaltyError}`);
  }

  return {
    txHash: acceptResult.result.hash,
    tokenId,
    resalePrice,
    royaltyPaid,
    royaltyError,
  };
}


// ═══════════════════════════════════════════════════════════════════
// 4. VERIFY TICKET
// ═══════════════════════════════════════════════════════════════════

/**
 * Verify ticket ownership and validity.
 * 
 * XRPL Primitive: account_nfts (XLS-20)
 * - Queries the ledger for all NFTs owned by an account
 * - Decodes the URI metadata to show event details
 * - Checks if the event date is still valid
 * 
 * This can be used by:
 *   - Event venues to verify ticket authenticity at the door
 *   - Fans to prove they own a legitimate ticket
 *   - Organizers to audit ticket distribution
 * 
 * @param {Client} client - Connected xrpl.Client
 * @param {string} walletAddress - Address to check ownership for
 * @param {string} tokenId - NFTokenID to verify
 * @returns {Object} { valid, owned, metadata, owner }
 */
async function verifyTicket(client, walletAddress, tokenId) {
  // Fetch the account's NFT inventory from the ledger
  const nft = await findNFToken(client, walletAddress, tokenId);

  if (!nft) {
    return {
      valid: false,
      owned: false,
      message: `Ticket NFT ${tokenId.slice(0, 16)}... is NOT owned by ${walletAddress}`,
      metadata: null,
    };
  }

  // Decode the ticket metadata from the NFT URI
  let metadata = null;
  try {
    metadata = decodeMetadata(nft.URI);
  } catch {
    metadata = { raw: nft.URI };
  }

  // Check event date validity
  const eventDate = metadata.eventDate ? new Date(metadata.eventDate) : null;
  const isExpired = eventDate && eventDate < new Date();

  const result = {
    valid: !isExpired,
    owned: true,
    owner: walletAddress,
    tokenId,
    metadata,
    isExpired,
    message: isExpired
      ? `⚠️ Ticket is owned but the event has already passed (${metadata.eventDate})`
      : `✅ Valid ticket! Owned by ${walletAddress}`,
  };

  console.log(`  🔍 Verification: ${result.message}`);
  if (metadata.eventName) {
    console.log(`     Event: ${metadata.eventName} | Seat: ${metadata.seat}`);
    console.log(`     Original Price: ${metadata.originalPrice} XRP`);
  }

  return result;
}


// ═══════════════════════════════════════════════════════════════════
// HELPER: Extract offer ID from transaction metadata
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract a newly created NFTokenOffer ID from transaction metadata.
 */
function extractOfferId(result) {
  const meta = result.result.meta;
  const affectedNodes = meta.AffectedNodes || [];

  for (const node of affectedNodes) {
    if (node.CreatedNode && node.CreatedNode.LedgerEntryType === 'NFTokenOffer') {
      return node.CreatedNode.LedgerIndex;
    }
  }
  throw new Error('Could not extract offer ID from transaction');
}


module.exports = {
  mintTicket,
  buyTicket,
  resellTicket,
  verifyTicket,
};
