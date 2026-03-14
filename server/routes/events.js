/**
 * Event Routes — List, Detail, Create
 */

const express = require('express');
const router = express.Router();

const { authMiddleware, requireOrganizer } = require('../auth');
const MongoEvent = require('../models/Event');
const MongoTicket = require('../models/Ticket');
const MongoUser = require('../models/User');
const logger = require('../logger');

/**
 * GET /api/events
 * List all events (public).
 */
router.get('/', async (req, res) => {
  try {
    const events = await MongoEvent.find()
      .populate('organizerId', 'displayName')
      .sort({ date: 1 })
      .lean();

    const enriched = await Promise.all(events.map(async (ev) => {
      const total_tickets = await MongoTicket.countDocuments({ eventId: ev._id });
      return {
        id: ev._id.toString(),
        name: ev.name,
        description: ev.description,
        date: ev.date,
        venue: ev.venue,
        organizer_name: ev.organizerId?.displayName || '',
        royalty_percent: ev.royaltyPercent ?? 10,
        total_tickets,
        available_tickets: total_tickets,
      };
    }));

    res.json({ success: true, events: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/events/:id
 * Event detail with tickets.
 */
router.get('/:id', async (req, res) => {
  try {
    const event = await MongoEvent.findById(req.params.id)
      .populate('organizerId', 'displayName')
      .lean();

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const tickets = await MongoTicket.find({ eventId: req.params.id })
      .populate('currentOwnerId', 'displayName')
      .lean();

    const eventOut = {
      id: event._id.toString(),
      name: event.name,
      description: event.description,
      date: event.date,
      venue: event.venue,
      organizer_name: event.organizerId?.displayName || '',
      royalty_percent: event.royaltyPercent ?? 10,
    };

    const ticketsOut = tickets.map(t => ({
      id: t._id.toString(),
      token_id: t.tokenId,
      seat: t.seat,
      original_price: t.price,
      max_resale_price: t.maxResalePrice,
      resale_count: t.resaleCount,
      redeemed: t.redeemed,
      owner_name: t.currentOwnerId?.displayName || '',
    }));

    res.json({ success: true, event: eventOut, tickets: ticketsOut });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/events
 * Create a new event (organizer only).
 * Body: { name, description, date, venue, royaltyPercent }
 * royaltyPercent: 0–50 (percentage, e.g. 10 = 10%). Defaults to 10.
 */
router.post('/', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { name, description, date, venue, royaltyPercent } = req.body;

    if (!name || !date) {
      return res.status(400).json({ success: false, error: 'Name and date are required' });
    }

    // Clamp royalty to 0–50%; default 10%
    const royaltyPct = Math.min(50, Math.max(0, parseFloat(royaltyPercent) || 10));

    const user = await MongoUser.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const event = await MongoEvent.create({
      name,
      description: description || '',
      date,
      venue: venue || '',
      organizerAddress: user.xrplAddress,
      organizerId: req.user.id,
      royaltyPercent: royaltyPct,
      ticketIds: [],
    });

    logger.info('EVENTS', `Created event "${name}" (id=${event._id.toString().slice(0, 8)}…)`);
    res.json({
      success: true,
      event: {
        id: event._id.toString(),
        name: event.name,
        description: event.description,
        date: event.date,
        venue: event.venue,
        royalty_percent: event.royaltyPercent,
      },
    });
  } catch (err) {
    logger.error('EVENTS create', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
