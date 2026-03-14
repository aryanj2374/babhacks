import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function MintPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // Create Event form
  const [eventForm, setEventForm] = useState({
    name: '',
    description: '',
    date: '',
    venue: '',
  });
  const [creatingEvent, setCreatingEvent] = useState(false);

  // Mint Tickets form
  const [selectedEvent, setSelectedEvent] = useState('');
  const [seats, setSeats] = useState([
    { seat: 'VIP-A101', originalPrice: '150', maxResalePrice: '200', maxResales: '3' },
  ]);
  const [minting, setMinting] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    const data = await api('/events');
    if (data.success) {
      setEvents(data.events);
      if (data.events.length > 0 && !selectedEvent) {
        setSelectedEvent(data.events[0].id);
      }
    }
    setLoading(false);
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    setCreatingEvent(true);
    setMessage(null);
    const data = await api('/events', 'POST', {
      ...eventForm,
      date: eventForm.date + 'T20:00:00Z',
    });
    if (data.success) {
      setMessage({ type: 'success', text: `✅ Event "${data.event.name}" created!` });
      setEventForm({ name: '', description: '', date: '', venue: '' });
      await loadEvents();
      setSelectedEvent(data.event.id);
    } else {
      setMessage({ type: 'error', text: `❌ ${data.error}` });
    }
    setCreatingEvent(false);
  }

  function addSeat() {
    const num = seats.length + 1;
    setSeats([...seats, {
      seat: `GA-${String(num).padStart(3, '0')}`,
      originalPrice: '75',
      maxResalePrice: '100',
      maxResales: '2',
    }]);
  }

  function removeSeat(index) {
    setSeats(seats.filter((_, i) => i !== index));
  }

  function updateSeat(index, key, value) {
    setSeats(seats.map((s, i) => i === index ? { ...s, [key]: value } : s));
  }

  async function handleMint() {
    if (!selectedEvent || seats.length === 0) return;
    setMinting(true);
    setMessage(null);
    const data = await api('/tickets/mint', 'POST', {
      eventId: selectedEvent,
      seats,
    });
    if (data.success) {
      setMessage({
        type: 'success',
        text: `✅ Minted ${data.tickets.length} ticket(s)! They're now available on the marketplace.`,
      });
    } else {
      setMessage({ type: 'error', text: `❌ ${data.error}` });
    }
    setMinting(false);
  }

  if (loading) {
    return <div className="page-loader"><div className="loader-spinner" /><p>Loading...</p></div>;
  }

  return (
    <div className="page mint-page">
      <div className="page-header">
        <h1>Mint Tickets</h1>
        <p>Create events and mint NFT tickets on the XRP Ledger</p>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* Create Event */}
      <section className="section">
        <h2 className="section-title">
          <span className="section-icon">🎪</span> Create Event
        </h2>
        <form onSubmit={handleCreateEvent} className="mint-form">
          <div className="form-grid-2">
            <div className="form-group">
              <label>Event Name</label>
              <input
                type="text"
                value={eventForm.name}
                onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                placeholder="Blockchain Music Festival 2026"
                required
              />
            </div>
            <div className="form-group">
              <label>Venue</label>
              <input
                type="text"
                value={eventForm.venue}
                onChange={e => setEventForm({ ...eventForm, venue: e.target.value })}
                placeholder="Crypto Arena, San Francisco"
              />
            </div>
            <div className="form-group">
              <label>Event Date</label>
              <input
                type="date"
                value={eventForm.date}
                onChange={e => setEventForm({ ...eventForm, date: e.target.value })}
                required
              />
            </div>
            <div className="form-group full-width">
              <label>Description</label>
              <textarea
                value={eventForm.description}
                onChange={e => setEventForm({ ...eventForm, description: e.target.value })}
                placeholder="Tell fans about your event..."
                rows={2}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={creatingEvent}>
            {creatingEvent ? '⏳ Creating...' : '✨ Create Event'}
          </button>
        </form>
      </section>

      {/* Mint Tickets */}
      <section className="section">
        <h2 className="section-title">
          <span className="section-icon">🎫</span> Mint NFT Tickets
        </h2>

        <div className="form-group">
          <label>Select Event</label>
          <select
            value={selectedEvent}
            onChange={e => setSelectedEvent(e.target.value)}
          >
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name} — {new Date(ev.date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        <div className="seats-list">
          <div className="seats-header">
            <h3>Tickets to Mint</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={addSeat}>
              + Add Ticket
            </button>
          </div>

          {seats.map((seat, i) => (
            <div key={i} className="seat-row">
              <div className="form-group">
                <label>Seat</label>
                <input type="text" value={seat.seat} onChange={e => updateSeat(i, 'seat', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Price (RLUSD)</label>
                <input type="number" value={seat.originalPrice} onChange={e => updateSeat(i, 'originalPrice', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Max Resale</label>
                <input type="number" value={seat.maxResalePrice} onChange={e => updateSeat(i, 'maxResalePrice', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Max Resales</label>
                <input type="number" value={seat.maxResales} onChange={e => updateSeat(i, 'maxResales', e.target.value)} />
              </div>
              {seats.length > 1 && (
                <button type="button" className="btn-icon-remove" onClick={() => removeSeat(i)}>✕</button>
              )}
            </div>
          ))}
        </div>

        <button
          className="btn btn-primary"
          onClick={handleMint}
          disabled={minting || !selectedEvent || seats.length === 0}
        >
          {minting ? '⏳ Minting on XRPL...' : `🎫 Mint ${seats.length} Ticket(s)`}
        </button>

        {minting && (
          <div className="mint-progress">
            ⏳ Minting tickets on the XRP Ledger. Each ticket takes ~5 seconds to mint. Please wait...
          </div>
        )}
      </section>
    </div>
  );
}
