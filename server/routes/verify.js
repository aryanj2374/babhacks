/**
 * Verify Routes — Ticket verification and redemption
 */

const express = require('express');
const router = express.Router();

const { authMiddleware, requireOrganizer } = require('../auth');
const { getClient } = require('../xrplClient');
const { verifyTicket } = require('../../src/ticket');
const MongoTicket = require('../models/Ticket');
const MongoUser = require('../models/User');

/**
 * GET /api/verify/:ticketId
 * Verify ticket ownership on-chain + check redemption status.
 */
router.get('/:ticketId', async (req, res) => {
  try {
    const ticket = await MongoTicket.findById(req.params.ticketId)
      .populate('eventId')
      .populate('currentOwnerId', 'displayName xrplAddress');

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // On-chain verification
    let onChainValid = false;
    try {
      const client = await getClient();
      const ownerAddress = ticket.currentOwnerId?.xrplAddress || ticket.ownerAddress;
      if (ownerAddress && ticket.tokenId) {
        const result = await verifyTicket(client, ownerAddress, ticket.tokenId);
        onChainValid = result.owned && result.valid;
      }
    } catch (err) {
      console.warn('On-chain verification failed:', err.message);
    }

    res.json({
      success: true,
      verification: {
        ticketId: ticket._id.toString(),
        eventName: ticket.eventId?.name || '',
        eventDate: ticket.eventId?.date || '',
        venue: ticket.eventId?.venue || '',
        seat: ticket.seat,
        ownerName: ticket.currentOwnerId?.displayName || '',
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
    const ticket = await MongoTicket.findById(req.params.ticketId).populate('eventId');

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (ticket.eventId?.organizerId?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You are not the organizer of this event' });
    }
    if (ticket.redeemed) {
      return res.status(400).json({ success: false, error: 'Ticket already redeemed' });
    }

    ticket.redeemed = true;
    await ticket.save();

    res.json({ success: true, message: 'Ticket redeemed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
