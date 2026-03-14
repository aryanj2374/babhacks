/**
 * Mongoose Model — User
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['organizer', 'fan'], default: 'fan' },
  displayName:  { type: String, default: '' },
  xrplAddress:  { type: String, default: '' },
  xrplSeed:               { type: String, default: '' }, // AES-encrypted seed — NOT plaintext
  trustLineEstablished:   { type: Boolean, default: false }, // RLUSD TrustLine set on-chain
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

userSchema.index({ role: 1 });
userSchema.index({ xrplAddress: 1 });

module.exports = mongoose.model('User', userSchema);
