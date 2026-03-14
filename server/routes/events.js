/**
 * Event Routes — List, Detail, Create
 */

const express = require('express');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const router = express.Router();

const { getDb } = require('../db');
const { authMiddleware, requireOrganizer } = require('../auth');

/**
 * GET /api/events
 * List all events (public).
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const events = db.prepare(`
      SELECT e.*, u.display_name as organizer_name,
        (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.current_owner_id IS NULL) as available_tickets,
        (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id) as total_tickets
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      ORDER BY e.date ASC
    `).all();

    res.json({ success: true, events });
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
    const db = getDb();
    const event = db.prepare(`
      SELECT e.*, u.display_name as organizer_name
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      WHERE e.id = ?
    `).get(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const tickets = db.prepare(`
      SELECT t.*, u.display_name as owner_name
      FROM tickets t
      LEFT JOIN users u ON t.current_owner_id = u.id
      WHERE t.event_id = ?
    `).all(req.params.id);

    res.json({ success: true, event, tickets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/events
 * Create a new event (organizer only).
 * Body: { name, description, date, venue }
 */
router.post('/', authMiddleware, requireOrganizer, async (req, res) => {
  try {
    const { name, description, date, venue } = req.body;

    if (!name || !date) {
      return res.status(400).json({ success: false, error: 'Name and date are required' });
    }

    const db = getDb();
    const eventId = uuidv4();

    db.prepare(
      'INSERT INTO events (id, organizer_id, name, description, date, venue) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(eventId, req.user.id, name, description || '', date, venue || '');

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
