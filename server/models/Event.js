/**
 * Mongoose Model — Event
 */

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name:             { type: String, required: true },
  organizerAddress: { type: String, required: true },
  organizerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date:             { type: String, default: '' },
  venue:            { type: String, default: '' },
  description:      { type: String, default: '' },
  royaltyPercent:   { type: Number, default: 10, min: 0, max: 50 },
  ticketIds:        [{ type: String }], // XRPL NFT tokenIds
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

eventSchema.index({ organizerAddress: 1 });
eventSchema.index({ organizerId: 1 });

module.exports = mongoose.model('Event', eventSchema);
