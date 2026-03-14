/**
 * Ticket Routes — Mint, Buy, Resell, List, QR Code
 */

const express = require('express');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const QRCode = require('qrcode');
const xrpl = require('xrpl');
const router = express.Router();

const { getDb } = require('../db');
const { authMiddleware, requireOrganizer } = require('../auth');
const { decrypt } = require('../crypto');
const { getClient } = require('../xrplClient');
const { mintTicket, buyTicket, resellTicket } = require('../../src/ticket');
const { getRLUSDBalance, establishTrustLine } = require('../../src/wallet');
const { sleep } = require('../../src/utils');

/**
 * GET /api/tickets/my
 * List tickets owned by current user.
 */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const tickets = db.prepare(`
      SELECT t.*, e.name as event_name, e.date as event_date, e.venue as event_venue
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.current_owner_id = ?
      ORDER BY e.date ASC
    `).all(req.user.id);

    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tickets/mint
 * Mint NFT tickets for an event (organizer only).
 * Body: { eventId, seats: [{ seat, originalPrice, maxResalePrice, maxResales }] }
 * Royalty is read from the event's royalty_percent field (set at event creation).
 */
router.post('/mint', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { eventId, seats } = req.body;
    if (!eventId || !seats || !seats.length) {
      return res.status(400).json({ success: false, error: 'eventId and seats array are required' });
    }

    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ? AND organizer_id = ?').get(eventId, req.user.id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found or not yours' });
    }

    const walletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
    if (!walletRow) {
      return res.status(400).json({ success: false, error: 'No wallet found' });
    }

    const client = await getClient();
    const organizerWallet = xrpl.Wallet.fromSeed(decrypt(walletRow.encrypted_seed));

    // Read royalty from the event record (set at event creation time)
    // XRPL scale: 50000=50%, 10000=10%, 1000=1%, 1=0.001%
    const royaltyPct = event.royalty_percent ?? 10;
    const royaltyBps = Math.round(Math.min(50, Math.max(0, royaltyPct)) * 1000);

    // Ensure organizer has a RLUSD TrustLine so royalties can be received.
    // This is done once and recorded in the DB to avoid repeated on-chain TrustSet calls.
    if (!walletRow.trust_line_established) {
      const issuerRow = db.prepare("SELECT value FROM platform_config WHERE key = 'issuer_address'").get();
      if (issuerRow) {
        await establishTrustLine(client, organizerWallet, issuerRow.value);
        db.prepare('UPDATE wallets SET trust_line_established = 1 WHERE user_id = ?').run(req.user.id);
      }
    }

    const mintedTickets = [];

    for (const seatInfo of seats) {
      const metadata = {
        eventId: event.id,
        eventName: event.name,
        seat: seatInfo.seat,
        originalPrice: seatInfo.originalPrice || '100',
        maxResalePrice: seatInfo.maxResalePrice || '150',
        eventDate: event.date,
        maxResales: parseInt(seatInfo.maxResales) || 3,
      };

      const result = await mintTicket(client, organizerWallet, metadata, royaltyBps);
      await sleep(1500);

      const ticketId = uuidv4();
      db.prepare(`
        INSERT INTO tickets (id, event_id, token_id, seat, original_price, max_resale_price, max_resales, resale_count, metadata_json, tx_hash, current_owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ticketId, eventId, result.tokenId, metadata.seat,
        metadata.originalPrice, metadata.maxResalePrice, metadata.maxResales,
        metadata.maxResales, // resale_count starts equal to max_resales (remaining resales)
        JSON.stringify(result.metadata), result.txHash, req.user.id
      );

      db.prepare(
        'INSERT INTO transactions (id, type, ticket_id, from_user_id, tx_hash) VALUES (?, ?, ?, ?, ?)'
      ).run(uuidv4(), 'MINT', ticketId, req.user.id, result.txHash);

      mintedTickets.push({ ticketId, tokenId: result.tokenId, seat: metadata.seat, txHash: result.txHash });
    }

    res.json({ success: true, tickets: mintedTickets });
  } catch (err) {
    console.error('Mint error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tickets/buy
 * Buy a ticket from the marketplace.
 * Handles both primary sales (organizer → fan) and secondary/resale (fan → fan).
 * Body: { ticketId }
 */
router.post('/buy', authMiddleware, async (req, res) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId) {
      return res.status(400).json({ success: false, error: 'ticketId is required' });
    }

    const db = getDb();
    // Join with owner's role so we can detect primary vs resale
    const ticket = db.prepare(`
      SELECT t.*, u.role as owner_role
      FROM tickets t
      JOIN users u ON t.current_owner_id = u.id
      WHERE t.id = ?
    `).get(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (ticket.current_owner_id === req.user.id) {
      return res.status(400).json({ success: false, error: 'You already own this ticket' });
    }

    // Get buyer and seller wallets
    const buyerWalletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
    const sellerWalletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(ticket.current_owner_id);
    if (!buyerWalletRow || !sellerWalletRow) {
      return res.status(400).json({ success: false, error: 'Wallet not found' });
    }

    const issuerRow = db.prepare("SELECT value FROM platform_config WHERE key = 'issuer_address'").get();
    if (!issuerRow) {
      return res.status(500).json({ success: false, error: 'Platform issuer not configured' });
    }

    const client = await getClient();
    const buyerWallet = xrpl.Wallet.fromSeed(decrypt(buyerWalletRow.encrypted_seed));
    const sellerWallet = xrpl.Wallet.fromSeed(decrypt(sellerWalletRow.encrypted_seed));

    const meta = JSON.parse(ticket.metadata_json || '{}');
    const isResale = ticket.owner_role !== 'organizer';

    if (isResale) {
      // ── Secondary / resale purchase ──
      // Block if no resales remain
      if (ticket.max_resales > 0 && ticket.resale_count <= 0) {
        return res.status(400).json({
          success: false,
          error: `This ticket has no resales remaining (0 / ${ticket.max_resales})`,
        });
      }

      const resalePrice = meta.listingPrice || ticket.original_price;

      // Build metadata for anti-scalping checks inside resellTicket
      const ticketMeta = { ...meta, resalesRemaining: ticket.resale_count };

      const result = await resellTicket(
        client, sellerWallet, buyerWallet,
        ticket.token_id, resalePrice, issuerRow.value, ticketMeta
      );

      const newResaleCount = ticket.max_resales > 0 ? ticket.resale_count - 1 : 0;

      // Clear listing flag, update owner, decrement resale count
      meta.listedForSale = false;
      delete meta.listingPrice;
      db.prepare(
        'UPDATE tickets SET current_owner_id = ?, resale_count = ?, metadata_json = ? WHERE id = ?'
      ).run(req.user.id, newResaleCount, JSON.stringify(meta), ticketId);

      db.prepare(
        'INSERT INTO transactions (id, type, ticket_id, from_user_id, to_user_id, price, tx_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), 'RESELL', ticketId, ticket.current_owner_id, req.user.id, resalePrice, result.txHash);

      return res.json({
        success: true,
        message: `Ticket purchased for ${resalePrice} RLUSD (resale; ${newResaleCount} resales remaining)`,
        royaltyPaid: result.royaltyPaid,
        txHash: result.txHash,
      });
    }

    // ── Primary sale (organizer → fan) ──
    const result = await buyTicket(
      client, buyerWallet, sellerWallet,
      ticket.token_id, ticket.original_price, issuerRow.value
    );

    db.prepare('UPDATE tickets SET current_owner_id = ? WHERE id = ?').run(req.user.id, ticketId);

    db.prepare(
      'INSERT INTO transactions (id, type, ticket_id, from_user_id, to_user_id, price, tx_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), 'BUY', ticketId, ticket.current_owner_id, req.user.id, ticket.original_price, result.txHash);

    res.json({
      success: true,
      message: `Ticket purchased for ${ticket.original_price} RLUSD`,
      txHash: result.txHash,
    });
  } catch (err) {
    console.error('Buy error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tickets/resell
 * Resell a ticket. Body: { ticketId, buyerId, resalePrice }
 */
router.post('/resell', authMiddleware, async (req, res) => {
  try {
    const { ticketId, buyerId, resalePrice } = req.body;
    if (!ticketId || !buyerId || !resalePrice) {
      return res.status(400).json({ success: false, error: 'ticketId, buyerId, and resalePrice are required' });
    }

    const db = getDb();
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (ticket.current_owner_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You do not own this ticket' });
    }

    const sellerWalletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.user.id);
    const buyerWalletRow = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(buyerId);
    if (!sellerWalletRow || !buyerWalletRow) {
      return res.status(400).json({ success: false, error: 'Wallet not found' });
    }

    const issuerRow = db.prepare("SELECT value FROM platform_config WHERE key = 'issuer_address'").get();

    const client = await getClient();
    const sellerWallet = xrpl.Wallet.fromSeed(decrypt(sellerWalletRow.encrypted_seed));
    const buyerWallet = xrpl.Wallet.fromSeed(decrypt(buyerWalletRow.encrypted_seed));

    const metadata = JSON.parse(ticket.metadata_json || '{}');
    // resale_count is remaining resales (countdown). 0 = no resales left.
    metadata.resalesRemaining = ticket.resale_count;

    // Pre-check before hitting XRPL: block immediately if no resales remain
    if (ticket.max_resales > 0 && ticket.resale_count <= 0) {
      return res.status(400).json({
        success: false,
        error: `This ticket has no resales remaining (0 / ${ticket.max_resales})`,
      });
    }

    const result = await resellTicket(
      client, sellerWallet, buyerWallet,
      ticket.token_id, resalePrice, issuerRow.value, metadata
    );

    // Decrement remaining resale count; unlimited (max_resales=0) stays at 0
    const newResaleCount = ticket.max_resales > 0 ? ticket.resale_count - 1 : 0;

    // Update ticket
    db.prepare(
      'UPDATE tickets SET current_owner_id = ?, resale_count = ? WHERE id = ?'
    ).run(buyerId, newResaleCount, ticketId);

    // Log transaction
    db.prepare(
      'INSERT INTO transactions (id, type, ticket_id, from_user_id, to_user_id, price, tx_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), 'RESELL', ticketId, req.user.id, buyerId, resalePrice, result.txHash);

    res.json({
      success: true,
      message: `Ticket resold for ${resalePrice} RLUSD`,
      royaltyPaid: result.royaltyPaid,
      txHash: result.txHash,
    });
  } catch (err) {
    console.error('Resell error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tickets/list-for-sale
 * List a ticket for sale on the marketplace.
 * Body: { ticketId, resalePrice }
 */
router.post('/list-for-sale', authMiddleware, async (req, res) => {
  try {
    const { ticketId, resalePrice } = req.body;
    if (!ticketId || !resalePrice) {
      return res.status(400).json({ success: false, error: 'ticketId and resalePrice required' });
    }

    const db = getDb();
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    if (ticket.current_owner_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You do not own this ticket' });
    }

    // Anti-scalping check: price cap
    const maxPrice = parseFloat(ticket.max_resale_price);
    if (parseFloat(resalePrice) > maxPrice) {
      return res.status(400).json({
        success: false,
        error: `Price exceeds maximum allowed resale price of ${ticket.max_resale_price} RLUSD`,
      });
    }

    // Anti-scalping check: resale count (resale_count is remaining, 0 = blocked)
    if (ticket.max_resales > 0 && ticket.resale_count <= 0) {
      return res.status(400).json({
        success: false,
        error: `This ticket has no resales remaining (0 / ${ticket.max_resales})`,
      });
    }

    // Store listing info in metadata
    const metadata = JSON.parse(ticket.metadata_json || '{}');
    metadata.listedForSale = true;
    metadata.listingPrice = resalePrice;

    db.prepare('UPDATE tickets SET metadata_json = ? WHERE id = ?').run(JSON.stringify(metadata), ticketId);

    res.json({ success: true, message: 'Ticket listed for sale' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tickets/marketplace
 * List all tickets currently for sale.
 */
router.get('/marketplace', async (req, res) => {
  try {
    const db = getDb();
    // Get tickets available for purchase:
    // 1) Organizer-owned tickets (primary/first sale — no resale slot consumed)
    // 2) Fan-listed resale tickets that still have resales remaining
    const tickets = db.prepare(`
      SELECT t.*, e.name as event_name, e.date as event_date, e.venue as event_venue,
             u.display_name as owner_name, u.role as owner_role
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN users u ON t.current_owner_id = u.id
      WHERE u.role = 'organizer'
         OR (
           t.metadata_json LIKE '%"listedForSale":true%'
           AND (t.max_resales = 0 OR t.resale_count > 0)
         )
      ORDER BY e.date ASC
    `).all();

    // Parse listing price from metadata
    const enriched = tickets.map(t => {
      const meta = JSON.parse(t.metadata_json || '{}');
      return {
        ...t,
        listingPrice: meta.listingPrice || t.original_price,
        // isResale: resale_count has decreased from max (some resales used)
        isResale: t.max_resales > 0 && t.resale_count < t.max_resales,
      };
    });

    res.json({ success: true, tickets: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tickets/:id/qr
 * Generate QR code for a ticket.
 */
router.get('/:id/qr', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // QR contains ticket verification data
    const qrData = JSON.stringify({
      ticketId: ticket.id,
      tokenId: ticket.token_id,
      seat: ticket.seat,
      eventId: ticket.event_id,
    });

    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: '#6366f1', light: '#0a0a0f' },
    });

    res.json({ success: true, qrCode: qrDataUrl, ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
