/**
 * MongoDB Routes — Query MongoDB collections directly.
 *
 * Endpoints:
 *   GET  /api/mongo/events              — list all events
 *   GET  /api/mongo/tickets/:userAddress — tickets owned by address
 *   POST /api/mongo/event               — create event
 *   POST /api/mongo/buy                 — update ticket ownership
 *   POST /api/mongo/resell              — update ticket ownership + resale price
 */

const express = require('express');
const router = express.Router();

const MongoUser   = require('../models/User');
const MongoEvent  = require('../models/Event');
const MongoTicket = require('../models/Ticket');
const logger      = require('../logger');

// ─── GET /events ─────────────────────────────────────────────────
router.get('/events', async (req, res) => {
  try {
    const events = await MongoEvent.find().sort({ date: 1 }).lean();

    const enriched = await Promise.all(events.map(async (ev) => {
      const totalTickets = await MongoTicket.countDocuments({ eventId: ev._id });
      const availableTickets = await MongoTicket.countDocuments({ eventId: ev._id, listedForSale: true });
      return { ...ev, id: ev._id.toString(), totalTickets, availableTickets };
    }));

    logger.info('MONGO', `GET /events → ${enriched.length} events`);
    res.json({ success: true, events: enriched });
  } catch (err) {
    logger.error('MONGO /events', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /tickets/:userAddress ───────────────────────────────────
router.get('/tickets/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const tickets = await MongoTicket.find({ ownerAddress: userAddress })
      .populate('eventId')
      .lean();

    logger.info('MONGO', `GET /tickets/${userAddress.slice(0, 12)}… → ${tickets.length} tickets`);
    res.json({ success: true, tickets });
  } catch (err) {
    logger.error(`MONGO /tickets/${req.params.userAddress}`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /event ─────────────────────────────────────────────────
router.post('/event', async (req, res) => {
  try {
    const { eventName, organizerAddress, date, venue, description } = req.body;
    if (!eventName || !organizerAddress) {
      return res.status(400).json({ success: false, error: 'eventName and organizerAddress are required' });
    }

    const event = await MongoEvent.create({
      name: eventName,
      organizerAddress,
      date: date || '',
      venue: venue || '',
      description: description || '',
      ticketIds: [],
    });

    logger.mongoSync('Event', 'create', event._id);
    logger.info('MONGO', `POST /event → created "${eventName}" by ${organizerAddress.slice(0, 12)}…`);
    res.json({ success: true, event });
  } catch (err) {
    logger.error('MONGO POST /event', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /buy ───────────────────────────────────────────────────
router.post('/buy', async (req, res) => {
  try {
    const { tokenId, buyerAddress } = req.body;
    if (!tokenId || !buyerAddress) {
      return res.status(400).json({ success: false, error: 'tokenId and buyerAddress are required' });
    }

    const ticket = await MongoTicket.findOne({ tokenId });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found in MongoDB' });
    }

    const previousOwner = ticket.ownerAddress;
    ticket.ownerAddress = buyerAddress;
    ticket.listedForSale = false;
    ticket.listingPrice = '0';
    await ticket.save();

    logger.mongoSync('Ticket', 'buy', ticket._id);
    logger.info('MONGO', `POST /buy → tokenId=${tokenId.slice(0, 16)}… owner ${previousOwner.slice(0, 8)}… → ${buyerAddress.slice(0, 8)}…`);
    res.json({ success: true, ticket });
  } catch (err) {
    logger.error('MONGO POST /buy', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /resell ────────────────────────────────────────────────
router.post('/resell', async (req, res) => {
  try {
    const { tokenId, buyerAddress, resalePrice } = req.body;
    if (!tokenId || !buyerAddress || !resalePrice) {
      return res.status(400).json({ success: false, error: 'tokenId, buyerAddress, and resalePrice are required' });
    }

    const ticket = await MongoTicket.findOne({ tokenId });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found in MongoDB' });
    }

    // OpenTix enforcement
    if (parseFloat(resalePrice) > parseFloat(ticket.maxResalePrice)) {
      return res.status(400).json({
        success: false,
        error: `Price ${resalePrice} exceeds max resale price ${ticket.maxResalePrice} XRP`,
      });
    }
    if (ticket.resaleCount >= ticket.maxResales) {
      return res.status(400).json({
        success: false,
        error: `Ticket has reached maximum resales (${ticket.maxResales})`,
      });
    }

    const previousOwner = ticket.ownerAddress;
    ticket.ownerAddress = buyerAddress;
    ticket.price = resalePrice;
    ticket.resaleCount += 1;
    ticket.listedForSale = false;
    ticket.listingPrice = '0';
    await ticket.save();

    logger.mongoSync('Ticket', 'resell', ticket._id);
    logger.info('MONGO', `POST /resell → tokenId=${tokenId.slice(0, 16)}… price=${resalePrice} XRP, resale #${ticket.resaleCount}`);
    res.json({ success: true, ticket });
  } catch (err) {
    logger.error('MONGO POST /resell', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
