/**
 * Mongoose Model — Event
 *
 * Stores event info and references to minted ticket tokenIds.
 */

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  eventName:        { type: String, required: true },
  organizerAddress: { type: String, required: true },
  date:             { type: String, default: '' },
  venue:            { type: String, default: '' },
  description:      { type: String, default: '' },
  ticketIds:        [{ type: String }],            // XRPL NFT tokenIds
  sqliteId:         { type: String, default: '' },  // cross-reference to SQLite
}, {
  timestamps: true,
});

eventSchema.index({ organizerAddress: 1 });

module.exports = mongoose.model('Event', eventSchema);
