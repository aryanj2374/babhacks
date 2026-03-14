/**
 * Ticket Routes — Mint, Buy, Resell, List, QR Code
 */

const express = require('express');
const QRCode = require('qrcode');
const xrpl = require('xrpl');
const router = express.Router();

const { authMiddleware, requireOrganizer } = require('../auth');
const { decrypt } = require('../crypto');
const { getClient } = require('../xrplClient');
const { mintTicket, buyTicket, resellTicket } = require('../../src/ticket');
const { sleep } = require('../../src/utils');
const MongoTicket = require('../models/Ticket');
const MongoEvent  = require('../models/Event');
const MongoUser   = require('../models/User');
const logger      = require('../logger');

/**
 * GET /api/tickets/my
 */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const tickets = await MongoTicket.find({ currentOwnerId: req.user.id })
      .populate('eventId')
      .lean();

    const result = tickets.map(t => ({
      id: t._id.toString(),
      token_id: t.tokenId,
      seat: t.seat,
      original_price: t.price,
      max_resale_price: t.maxResalePrice,

      redeemed: t.redeemed,
      listed_for_sale: t.listedForSale,
      listing_price: t.listingPrice,
      tx_hash: t.txHash,
      event_name: t.eventId?.name || '',
      event_date: t.eventId?.date || '',
      event_venue: t.eventId?.venue || '',
    }));

    res.json({ success: true, tickets: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tickets/mint
 * Mint NFT tickets for an event (organizer only).
 * Body: { eventId, seats: [{ seat, originalPrice, maxResalePrice }] }
 * Royalty is read from the event's royaltyPercent field (set at event creation).
 */
router.post('/mint', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { eventId, seats } = req.body;
    if (!eventId || !seats || !seats.length) {
      return res.status(400).json({ success: false, error: 'eventId and seats array are required' });
    }

    const event = await MongoEvent.findOne({ _id: eventId, organizerId: req.user.id });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found or not yours' });

    const user = await MongoUser.findById(req.user.id);
    if (!user || !user.xrplSeed) return res.status(400).json({ success: false, error: 'No wallet found' });

    const client = await getClient();
    const organizerWallet = xrpl.Wallet.fromSeed(decrypt(user.xrplSeed));

    // Read royalty from the event record (set at event creation time)
    // XRPL scale: 50000=50%, 10000=10%, 1000=1%, 1=0.001%
    const royaltyPct = event.royaltyPercent ?? 10;
    const royaltyBps = Math.round(Math.min(50, Math.max(0, royaltyPct)) * 1000);

    const mintedTickets = [];

    for (const seatInfo of seats) {
      const metadata = {
        eventId: event._id.toString(),
        eventName: event.name,
        seat: seatInfo.seat,
        originalPrice: seatInfo.originalPrice || '10',
        maxResalePrice: seatInfo.maxResalePrice || '15',
        eventDate: event.date,
      };

      const result = await mintTicket(client, organizerWallet, metadata, royaltyBps);
      await sleep(1500);

      const mongoTicket = await MongoTicket.create({
        tokenId: result.tokenId,
        ownerAddress: organizerWallet.address,
        currentOwnerId: req.user.id,
        price: metadata.originalPrice,
        maxResalePrice: metadata.maxResalePrice,
        eventId: event._id,
        seat: metadata.seat,
        redeemed: false,
        listedForSale: true,
        listingPrice: metadata.originalPrice,
        txHash: result.txHash,
      });

      event.ticketIds.push(result.tokenId);

      mintedTickets.push({
        ticketId: mongoTicket._id.toString(),
        tokenId: result.tokenId,
        seat: metadata.seat,
        txHash: result.txHash,
      });
    }

    await event.save();

    logger.mint({
      eventId: event._id.toString(),
      eventName: event.name,
      ticketIds: mintedTickets.map(t => t.tokenId),
      organizerAddress: organizerWallet.address,
      txHash: mintedTickets[0]?.txHash || '',
    });

    res.json({ success: true, tickets: mintedTickets });
  } catch (err) {
    logger.error('TICKETS mint', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tickets/buy
 * Buy a ticket from the marketplace (primary or resale).
 * Body: { ticketId }
 */
router.post('/buy', authMiddleware, async (req, res) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId) return res.status(400).json({ success: false, error: 'ticketId is required' });

    const ticket = await MongoTicket.findById(ticketId)
      .populate('currentOwnerId', 'role xrplSeed xrplAddress displayName')
      .populate('eventId', 'date');
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    if (ticket.currentOwnerId?._id?.toString() === req.user.id) {
      return res.status(400).json({ success: false, error: 'You already own this ticket' });
    }

    const buyer = await MongoUser.findById(req.user.id);
    const seller = ticket.currentOwnerId; // already populated
    if (!buyer?.xrplSeed || !seller?.xrplSeed) {
      return res.status(400).json({ success: false, error: 'Wallet not found' });
    }

    const client = await getClient();
    const buyerWallet = xrpl.Wallet.fromSeed(decrypt(buyer.xrplSeed));
    const sellerWallet = xrpl.Wallet.fromSeed(decrypt(seller.xrplSeed));

    const isResale = seller.role !== 'organizer';

    if (isResale) {
      const resalePrice = ticket.listingPrice || ticket.price;
      const metadata = {
        maxResalePrice: ticket.maxResalePrice,
        eventDate: ticket.eventId?.date,
      };

      const result = await resellTicket(client, sellerWallet, buyerWallet, ticket.tokenId, resalePrice, metadata);

      ticket.ownerAddress = buyerWallet.address;
      ticket.currentOwnerId = req.user.id;
      ticket.price = resalePrice;
      ticket.listedForSale = false;
      ticket.listingPrice = '0';
      await ticket.save();

      logger.buy({ buyerAddress: buyerWallet.address, ticketId: ticket.tokenId, amount: resalePrice, txHash: result.txHash });

      return res.json({
        success: true,
        message: `Ticket purchased for ${resalePrice} XRP`,
        royaltyPaid: result.royaltyPaid,
        txHash: result.txHash,
      });
    }

    // Primary sale (organizer → fan)
    const salePrice = ticket.listingPrice && parseFloat(ticket.listingPrice) > 0
      ? ticket.listingPrice
      : ticket.price;
    if (!salePrice || parseFloat(salePrice) <= 0) {
      return res.status(400).json({ success: false, error: 'Ticket price is not set' });
    }
    const result = await buyTicket(client, buyerWallet, sellerWallet, ticket.tokenId, salePrice);

    ticket.ownerAddress = buyerWallet.address;
    ticket.currentOwnerId = req.user.id;
    ticket.price = salePrice;
    ticket.listedForSale = false;
    ticket.listingPrice = '0';
    await ticket.save();

    logger.buy({ buyerAddress: buyerWallet.address, ticketId: ticket.tokenId, amount: salePrice, txHash: result.txHash });

    res.json({
      success: true,
      message: `Ticket purchased for ${salePrice} XRP`,
      txHash: result.txHash,
    });
  } catch (err) {
    logger.error('TICKETS buy', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tickets/resell
 * Body: { ticketId, buyerId, resalePrice }
 */
router.post('/resell', authMiddleware, async (req, res) => {
  try {
    const { ticketId, buyerId, resalePrice } = req.body;
    if (!ticketId || !buyerId || !resalePrice) {
      return res.status(400).json({ success: false, error: 'ticketId, buyerId, and resalePrice are required' });
    }

    const ticket = await MongoTicket.findById(ticketId).populate('eventId');
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    if (ticket.currentOwnerId?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You do not own this ticket' });
    }

    const seller = await MongoUser.findById(req.user.id);
    const buyer = await MongoUser.findById(buyerId);
    if (!seller?.xrplSeed || !buyer?.xrplSeed) {
      return res.status(400).json({ success: false, error: 'Wallet not found' });
    }

    const client = await getClient();
    const sellerWallet = xrpl.Wallet.fromSeed(decrypt(seller.xrplSeed));
    const buyerWallet = xrpl.Wallet.fromSeed(decrypt(buyer.xrplSeed));

    const metadata = {
      maxResalePrice: ticket.maxResalePrice,
      eventDate: ticket.eventId?.date,
    };

    const result = await resellTicket(client, sellerWallet, buyerWallet, ticket.tokenId, resalePrice, metadata);

    ticket.ownerAddress = buyerWallet.address;
    ticket.currentOwnerId = buyerId;
    ticket.price = resalePrice;
    ticket.listedForSale = false;
    ticket.listingPrice = '0';
    await ticket.save();

    logger.resell({ sellerAddress: sellerWallet.address, ticketId: ticket.tokenId, resalePrice, txHash: result.txHash, royaltyPaid: result.royaltyPaid });

    res.json({
      success: true,
      message: `Ticket resold for ${resalePrice} XRP`,
      royaltyPaid: result.royaltyPaid,
      txHash: result.txHash,
    });
  } catch (err) {
    logger.error('TICKETS resell', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/tickets/list-for-sale
 * Body: { ticketId, resalePrice }
 */
router.post('/list-for-sale', authMiddleware, async (req, res) => {
  try {
    const { ticketId, resalePrice } = req.body;
    if (!ticketId || !resalePrice) {
      return res.status(400).json({ success: false, error: 'ticketId and resalePrice required' });
    }

    const ticket = await MongoTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    if (ticket.currentOwnerId?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You do not own this ticket' });
    }

    if (parseFloat(resalePrice) > parseFloat(ticket.maxResalePrice)) {
      return res.status(400).json({
        success: false,
        error: `Price exceeds the maximum allowed resale price of ${ticket.maxResalePrice} XRP`,
      });
    }

    ticket.listedForSale = true;
    ticket.listingPrice = resalePrice;
    await ticket.save();

    logger.info('TICKETS', `Listed ticket ${ticketId.slice(0, 8)}… for ${resalePrice} XRP`);
    res.json({ success: true, message: 'Ticket listed for sale' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tickets/marketplace
 */
router.get('/marketplace', async (req, res) => {
  try {
    const tickets = await MongoTicket.find({ listedForSale: true })
      .populate('eventId')
      .populate('currentOwnerId', 'displayName role')
      .lean();

    const enriched = tickets.map(t => ({
      id: t._id.toString(),
      token_id: t.tokenId,
      seat: t.seat,
      original_price: t.price,
      max_resale_price: t.maxResalePrice,

      redeemed: t.redeemed,
      event_name: t.eventId?.name || '',
      event_date: t.eventId?.date || '',
      event_venue: t.eventId?.venue || '',
      owner_name: t.currentOwnerId?.displayName || '',
      owner_role: t.currentOwnerId?.role || '',
      listingPrice: t.listingPrice || t.price,
      isResale: t.currentOwnerId?.role !== 'organizer',
    }));

    res.json({ success: true, tickets: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tickets/:id/qr
 */
router.get('/:id/qr', authMiddleware, async (req, res) => {
  try {
    const ticket = await MongoTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const qrData = JSON.stringify({
      ticketId: ticket._id.toString(),
      tokenId: ticket.tokenId,
      seat: ticket.seat,
      eventId: ticket.eventId?.toString(),
    });
    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 300, margin: 2,
      color: { dark: '#6366f1', light: '#0a0a0f' },
    });

    res.json({
      success: true,
      qrCode: qrDataUrl,
      ticket: {
        id: ticket._id.toString(),
        token_id: ticket.tokenId,
        seat: ticket.seat,
        redeemed: ticket.redeemed,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
