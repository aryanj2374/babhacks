/**
 * Verify Routes — Ticket verification and redemption
 */

const express = require('express');
const router = express.Router();

const { getDb } = require('../db');
const { authMiddleware, requireOrganizer } = require('../auth');
const { getClient } = require('../xrplClient');
const { verifyTicket } = require('../../src/ticket');

/**
 * GET /api/verify/:ticketId
 * Verify ticket ownership on-chain + check redemption status.
 */
router.get('/:ticketId', async (req, res) => {
  try {
    const db = getDb();
    const ticket = db.prepare(`
      SELECT t.*, e.name as event_name, e.date as event_date, e.venue as event_venue,
             u.display_name as owner_name
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN users u ON t.current_owner_id = u.id
      WHERE t.id = ?
    `).get(req.params.ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // On-chain verification
    let onChainValid = false;
    try {
      const client = await getClient();
      const wallet = db.prepare('SELECT xrpl_address FROM wallets WHERE user_id = ?').get(ticket.current_owner_id);
      if (wallet && ticket.token_id) {
        const result = await verifyTicket(client, wallet.xrpl_address, ticket.token_id);
        onChainValid = result.owned && result.valid;
      }
    } catch (err) {
      console.warn('On-chain verification failed:', err.message);
    }

    res.json({
      success: true,
      verification: {
        ticketId: ticket.id,
        eventName: ticket.event_name,
        eventDate: ticket.event_date,
        venue: ticket.event_venue,
        seat: ticket.seat,
        ownerName: ticket.owner_name,
        redeemed: !!ticket.redeemed,
        onChainValid,
        valid: !ticket.redeemed && onChainValid,
        message: ticket.redeemed
          ? '⚠️ Ticket has already been redeemed'
          : onChainValid
            ? '✅ Valid ticket — ownership confirmed on-chain'
            : '⚠️ Could not verify on-chain ownership',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/verify/:ticketId/redeem
 * Mark ticket as redeemed (organizer only).
 */
router.post('/:ticketId/redeem', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const db = getDb();
    const ticket = db.prepare(`
      SELECT t.*, e.organizer_id FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.id = ?
    `).get(req.params.ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (ticket.organizer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You are not the organizer of this event' });
    }
    if (ticket.redeemed) {
      return res.status(400).json({ success: false, error: 'Ticket already redeemed' });
    }

    db.prepare('UPDATE tickets SET redeemed = 1 WHERE id = ?').run(req.params.ticketId);

    res.json({ success: true, message: 'Ticket redeemed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
