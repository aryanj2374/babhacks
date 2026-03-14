/**
 * Core Ticketing Logic for XRPL Anti-Scalping System
 * 
 * This module implements the four main functions:
 *   1. mintTicket   — Organizer creates an NFT ticket (XLS-20 NFTokenMint)
 *   2. buyTicket    — Fan purchases a ticket (NFTokenCreateOffer + NFTokenAcceptOffer)
 *   3. resellTicket — Fan resells with anti-scalping enforcement
 *   4. verifyTicket — Ownership & validity check (account_nfts)
 * 
 * XRPL Primitives used:
 *   - NFTokenMint: Creates a new NFT on the ledger
 *   - NFTokenCreateOffer: Creates a buy or sell offer for an NFT
 *   - NFTokenAcceptOffer: Accepts an existing offer, completing the trade
 *   - TransferFee: Built-in royalty mechanism (paid to original minter on every resale)
 *   - account_nfts: Query an account's NFT inventory
 * 
 * Anti-Scalping Enforcement:
 *   - Max resale price is encoded in NFT metadata and checked before creating offers
 *   - Resale count limits are tracked in metadata and enforced at application layer
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
 *   @param {string} metadata.originalPrice - Face value in RLUSD
 *   @param {string} metadata.maxResalePrice - Maximum allowed resale price
 *   @param {string} metadata.eventDate - Event date (ISO format)
 *   @param {number} metadata.maxResales - Maximum number of resales allowed (0 = unlimited)
 *   @param {number} [metadata.resaleCount=0] - Current resale count (starts at 0)
 * @returns {Object} { tokenId, txHash, metadata }
 */
async function mintTicket(client, organizerWallet, metadata) {
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
  const { minter: _m, mintedAt: _t, ...uriMetadata } = fullMetadata;
  const uri = encodeMetadata(uriMetadata);

  // Build the NFTokenMint transaction
  const mintTx = {
    TransactionType: 'NFTokenMint',
    Account: organizerWallet.address,
    URI: uri,
    // Flags: tfTransferable (8) + tfBurnable (1) = 9
    // tfTransferable allows secondary market sales
    // tfBurnable allows organizer to burn expired/invalid tickets
    Flags: 8 + 1,
    // TransferFee: Royalty in basis points, auto-collected by XRPL on every resale
    // This is enforced at the protocol level — no smart contract needed!
    TransferFee: config.DEFAULT_ROYALTY_BPS,
    // NFTokenTaxon: Groups all tickets for this event together
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

  console.log(`  🎫 Minted ticket NFT: ${tokenId}`);
  console.log(`     Event: ${fullMetadata.eventName} | Seat: ${fullMetadata.seat}`);
  console.log(`     Price: ${fullMetadata.originalPrice} RLUSD | Max Resale: ${fullMetadata.maxResalePrice} RLUSD`);

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
 * Buy a ticket from the organizer (primary sale) or from a fan (secondary sale).
 * 
 * XRPL Primitives used:
 *   - NFTokenCreateOffer: Seller creates a sell offer for the NFT
 *   - NFTokenCreateOffer: Buyer creates a buy offer (optional, for brokered mode)
 *   - NFTokenAcceptOffer: Accepts the sell offer, atomically transferring NFT + payment
 * 
 * Flow:
 *   1. Seller creates a sell offer specifying the price in RLUSD
 *   2. Buyer accepts the sell offer
 *   3. XRPL atomically: transfers NFT to buyer, transfers RLUSD to seller
 *   4. If TransferFee is set, XRPL auto-deducts royalty to the original minter
 * 
 * @param {Client} client - Connected xrpl.Client
 * @param {Wallet} buyerWallet - The fan's wallet
 * @param {Wallet} sellerWallet - The organizer's or current owner's wallet
 * @param {string} tokenId - NFTokenID of the ticket to buy
 * @param {string} price - Price in RLUSD
 * @param {string} issuerAddress - RLUSD issuer address for payment
 * @returns {Object} { txHash, tokenId, price }
 */
async function buyTicket(client, buyerWallet, sellerWallet, tokenId, price, issuerAddress) {
  // Step 1: Seller creates a sell offer
  // NFTokenCreateOffer with Flags=1 (tfSellNFToken) means "I'm selling this NFT"
  const sellOfferTx = {
    TransactionType: 'NFTokenCreateOffer',
    Account: sellerWallet.address,
    NFTokenID: tokenId,
    // Amount in RLUSD (IOU format: { currency, issuer, value })
    Amount: {
      currency: config.RLUSD_CURRENCY,
      issuer: issuerAddress,
      value: price,
    },
    // Destination: restrict who can accept this offer (the buyer)
    Destination: buyerWallet.address,
    // Flags: 1 = tfSellNFToken (this is a sell offer)
    Flags: 1,
  };

  const sellResult = await submitWithBuffer(client, sellOfferTx, sellerWallet);
  if (sellResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Sell offer failed: ${sellResult.result.meta.TransactionResult}`);
  }

  // Extract the offer ID from the transaction metadata
  const sellOfferId = extractOfferId(sellResult);
  console.log(`  📋 Sell offer created: ${sellOfferId}`);

  // Step 2: Buyer accepts the sell offer
  // NFTokenAcceptOffer atomically executes the trade:
  //   - NFT moves from seller → buyer
  //   - RLUSD moves from buyer → seller (minus royalty)
  //   - Royalty (TransferFee) automatically goes to original minter
  const acceptTx = {
    TransactionType: 'NFTokenAcceptOffer',
    Account: buyerWallet.address,
    NFTokenSellOffer: sellOfferId,
  };

  const acceptResult = await submitWithBuffer(client, acceptTx, buyerWallet);
  if (acceptResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Accept offer failed: ${acceptResult.result.meta.TransactionResult}`);
  }

  console.log(`  ✅ Ticket purchased! NFT ${tokenId.slice(0, 16)}... transferred to ${buyerWallet.address}`);

  return {
    txHash: acceptResult.result.hash,
    tokenId,
    price,
    sellOfferId,
  };
}


// ═══════════════════════════════════════════════════════════════════
// 3. RESELL TICKET (Secondary Market with Anti-Scalping)
// ═══════════════════════════════════════════════════════════════════

/**
 * Resell a ticket on the secondary market with anti-scalping enforcement.
 * 
 * Anti-Scalping Checks (Application Layer):
 *   1. Resale price must not exceed maxResalePrice from ticket metadata
 *   2. Resale count must not exceed maxResales from ticket metadata
 *   3. Event date must not have passed
 * 
 * XRPL Primitives (Protocol Layer):
 *   - TransferFee: Royalty automatically deducted and sent to organizer (minter)
 *   - NFTokenCreateOffer: Creates the sell offer at the validated price
 *   - NFTokenAcceptOffer: Buyer accepts, completing the atomic swap
 * 
 * The combination of application-layer price caps + protocol-layer royalties
 * creates a robust anti-scalping system:
 *   - Scalpers cannot list above maxResalePrice (app enforces)
 *   - Organizers always get their royalty cut (XRPL enforces)
 *   - Resale limits prevent ticket churning (app enforces)
 * 
 * @param {Client} client - Connected xrpl.Client
 * @param {Wallet} sellerWallet - Current ticket owner's wallet
 * @param {Wallet} buyerWallet - The new buyer's wallet
 * @param {string} tokenId - NFTokenID of the ticket
 * @param {string} resalePrice - Proposed resale price in RLUSD
 * @param {string} issuerAddress - RLUSD issuer address
 * @param {Object} ticketMetadata - Original ticket metadata (from NFT URI)
 * @returns {Object} { txHash, tokenId, resalePrice, royaltyPaid }
 */
async function resellTicket(client, sellerWallet, buyerWallet, tokenId, resalePrice, issuerAddress, ticketMetadata) {
  // ── Anti-Scalping Check 1: Max Resale Price ──
  const maxPrice = parseFloat(ticketMetadata.maxResalePrice);
  const proposedPrice = parseFloat(resalePrice);
  if (proposedPrice > maxPrice) {
    throw new Error(
      `🚫 ANTI-SCALPING: Resale price ${resalePrice} RLUSD exceeds maximum allowed price of ${ticketMetadata.maxResalePrice} RLUSD`
    );
  }

  // ── Anti-Scalping Check 2: Resale Count Limit ──
  const maxResales = ticketMetadata.maxResales || 0;
  const currentResales = ticketMetadata.resaleCount || 0;
  if (maxResales > 0 && currentResales >= maxResales) {
    throw new Error(
      `🚫 ANTI-SCALPING: This ticket has reached the maximum number of resales (${maxResales})`
    );
  }

  // ── Anti-Scalping Check 3: Event Date Validity ──
  const eventDate = new Date(ticketMetadata.eventDate);
  if (eventDate < new Date()) {
    throw new Error(
      `🚫 INVALID: This ticket's event has already passed (${ticketMetadata.eventDate})`
    );
  }

  console.log(`  🔍 Anti-scalping checks passed:`);
  console.log(`     Price: ${resalePrice}/${ticketMetadata.maxResalePrice} RLUSD ✓`);
  console.log(`     Resales: ${currentResales + 1}/${maxResales || '∞'} ✓`);

  // ── Execute the resale using XRPL NFT offer primitives ──
  // Same flow as buyTicket, but with anti-scalping validation done above

  // Step 1: Create sell offer
  const sellOfferTx = {
    TransactionType: 'NFTokenCreateOffer',
    Account: sellerWallet.address,
    NFTokenID: tokenId,
    Amount: {
      currency: config.RLUSD_CURRENCY,
      issuer: issuerAddress,
      value: resalePrice,
    },
    Destination: buyerWallet.address,
    Flags: 1, // tfSellNFToken
  };

  const sellResult = await submitWithBuffer(client, sellOfferTx, sellerWallet);
  if (sellResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Resale sell offer failed: ${sellResult.result.meta.TransactionResult}`);
  }

  const sellOfferId = extractOfferId(sellResult);
  console.log(`  📋 Resale sell offer created: ${sellOfferId}`);

  // Step 2: Buyer accepts the offer
  // XRPL automatically handles:
  //   - NFT transfer: seller → buyer
  //   - Payment: buyer → seller (minus TransferFee royalty)
  //   - Royalty: TransferFee % → original minter (organizer)
  const acceptTx = {
    TransactionType: 'NFTokenAcceptOffer',
    Account: buyerWallet.address,
    NFTokenSellOffer: sellOfferId,
  };

  const acceptResult = await submitWithBuffer(client, acceptTx, buyerWallet);
  if (acceptResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Resale accept failed: ${acceptResult.result.meta.TransactionResult}`);
  }

  // Calculate royalty that was automatically paid
  const royaltyPercent = config.DEFAULT_ROYALTY_BPS / 100;
  const royaltyAmount = (proposedPrice * config.DEFAULT_ROYALTY_BPS / 10000).toFixed(2);

  console.log(`  ✅ Ticket resold! NFT transferred to ${buyerWallet.address}`);
  console.log(`     💰 Royalty auto-paid to organizer: ${royaltyAmount} RLUSD (${royaltyPercent}%)`);

  return {
    txHash: acceptResult.result.hash,
    tokenId,
    resalePrice,
    royaltyPaid: royaltyAmount,
    newResaleCount: currentResales + 1,
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
    console.log(`     Original Price: ${metadata.originalPrice} RLUSD`);
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
