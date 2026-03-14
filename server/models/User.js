/**
 * Mongoose Model — User
 *
 * Mirrors the SQLite users + wallets tables for MongoDB queries.
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  role:         { type: String, enum: ['organizer', 'fan'], default: 'fan' },
  displayName:  { type: String, default: '' },
  xrplAddress:  { type: String, default: '' },
  xrplSeed:     { type: String, default: '' }, // AES-encrypted seed — NOT plaintext
}, {
  timestamps: true,
});

// Index by role for quick organizer lookups
userSchema.index({ role: 1 });
userSchema.index({ xrplAddress: 1 });

module.exports = mongoose.model('User', userSchema);
