/**
 * Mongoose Model — Ticket
 *
 * Tracks NFT ticket state: ownership, pricing, resale, redemption.
 */

const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  tokenId:        { type: String, required: true, unique: true }, // XRPL NFT tokenId
  ownerAddress:   { type: String, required: true },
  price:          { type: String, default: '0' },                 // original or current price
  maxResalePrice: { type: String, default: '0' },
  maxResales:     { type: Number, default: 3 },
  resaleCount:    { type: Number, default: 0 },
  eventId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  seat:           { type: String, default: '' },
  redeemed:       { type: Boolean, default: false },
  listedForSale:  { type: Boolean, default: false },
  listingPrice:   { type: String, default: '0' },
  txHash:         { type: String, default: '' },                  // mint tx hash
  sqliteId:       { type: String, default: '' },                  // cross-reference
}, {
  timestamps: true,
});

ticketSchema.index({ ownerAddress: 1 });
ticketSchema.index({ eventId: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);
