import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { CalendarIcon, ZapIcon } from '../components/Icons';

export default function MintPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const [eventForm, setEventForm] = useState({ name: '', description: '', date: '', venue: '', royaltyPercent: '10' });
  const [creatingEvent, setCreatingEvent] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState('');
  const [seats, setSeats] = useState([
    { seat: 'VIP-A101', originalPrice: '150', maxResalePrice: '200' },
  ]);
  const [minting, setMinting] = useState(false);

  useEffect(() => { loadEvents(); }, []);

  async function loadEvents() {
    setLoading(true);
    const data = await api('/events/mine');
    if (data.success) {
      setEvents(data.events);
      if (data.events.length > 0 && !selectedEvent) setSelectedEvent(data.events[0].id);
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
      royaltyPercent: parseFloat(eventForm.royaltyPercent) || 10,
    });
    if (data.success) {
      setMessage({ type: 'success', text: `Event "${data.event.name}" created! Royalty: ${data.event.royalty_percent}%` });
      setEventForm({ name: '', description: '', date: '', venue: '', royaltyPercent: '10' });
      await loadEvents();
      setSelectedEvent(data.event.id);
    } else {
      setMessage({ type: 'error', text: data.error });
    }
    setCreatingEvent(false);
  }

  function addSeat() {
    const num = seats.length + 1;
    setSeats([...seats, { seat: `GA-${String(num).padStart(3, '0')}`, originalPrice: '75', maxResalePrice: '100' }]);
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
    const data = await api('/tickets/mint', 'POST', { eventId: selectedEvent, seats });
    if (data.success) {
      setMessage({ type: 'success', text: `Minted ${data.tickets.length} ticket(s)! Now available on marketplace.` });
    } else {
      setMessage({ type: 'error', text: data.error });
    }
    setMinting(false);
  }

  if (loading) {
    return <div className="page-loader"><div className="loader-spinner" /><p>Loading…</p></div>;
  }

  const selectedEventObj = events.find(e => e.id === selectedEvent);
  const previewSeat = seats[0];

  return (
    <div className="page mint-page">
      <div className="page-header">
        <h1>Mint Tickets</h1>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Create events and mint NFTs on XRPL</span>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="mint-layout">
        {/* Create Event */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title"><CalendarIcon size={11} /> Create Event</span>
          </div>
          <form onSubmit={handleCreateEvent} className="mint-form">
            <div className="mint-form-body">
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Event Name</label>
                  <input
                    type="text"
                    value={eventForm.name}
                    onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                    placeholder="Blockchain Music Festival"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Venue</label>
                  <input
                    type="text"
                    value={eventForm.venue}
                    onChange={e => setEventForm({ ...eventForm, venue: e.target.value })}
                    placeholder="Crypto Arena, SF"
                  />
                </div>
                <div className="form-group">
                  <label>Royalty % <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 400 }}>(0–50, applied to every resale)</span></label>
                  <input
                    type="number"
                    value={eventForm.royaltyPercent}
                    onChange={e => setEventForm({ ...eventForm, royaltyPercent: e.target.value })}
                    min="0"
                    max="50"
                    step="0.5"
                    placeholder="10"
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
                    placeholder="Tell fans about your event…"
                    rows={2}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={creatingEvent}>
                {creatingEvent ? <><span className="spinner" />Creating…</> : 'Create Event'}
              </button>
            </div>
          </form>

          {/* Existing events list */}
          {events.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ padding: '7px 14px', fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                Your Events ({events.length})
              </div>
              {events.map(ev => (
                <div
                  key={ev.id}
                  onClick={() => setSelectedEvent(ev.id)}
                  style={{
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: selectedEvent === ev.id ? 'var(--accent-glow)' : 'transparent',
                    borderLeft: selectedEvent === ev.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    transition: 'var(--transition)',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 500, color: selectedEvent === ev.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{ev.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {ev.venue ? ` · ${ev.venue}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mint Tickets */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title"><ZapIcon size={11} /> Mint NFT Tickets</span>
            {events.length > 0 && (
              <div className="form-group" style={{ margin: 0, minWidth: '140px' }}>
                <select
                  value={selectedEvent}
                  onChange={e => setSelectedEvent(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                >
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {events.length === 0 ? (
            <div className="empty-state">
              <p>Create an event first to mint tickets.</p>
            </div>
          ) : (
            <>
              {/* Live ticket preview */}
              {previewSeat && selectedEventObj && (
                <div className="ticket-preview-wrap">
                  <div className="ticket-preview-label">Live Preview</div>
                  <div className="ticket-preview-card">
                    <div className="tpc-header">
                      <span className="tpc-event">{selectedEventObj.name}</span>
                      <span className="tpc-badge">NFT</span>
                    </div>
                    <div className="tpc-body">
                      <div className="tpc-field">
                        <div className="tpc-label">Seat</div>
                        <div className="tpc-val">{previewSeat.seat || '—'}</div>
                      </div>
                      <div className="tpc-field">
                        <div className="tpc-label">Price</div>
                        <div className="tpc-val">{previewSeat.originalPrice || '—'} <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>XRP</span></div>
                      </div>
                      <div className="tpc-field">
                        <div className="tpc-label">Max Resale</div>
                        <div className="tpc-val">{previewSeat.maxResalePrice || '—'} <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>XRP</span></div>
                      </div>
                    </div>
                    <div className="tpc-tear" />
                    <div className="tpc-footer">
                      <span className="tpc-meta">XRPL Testnet · XLS-20</span>
                      <span className="tpc-meta">{selectedEventObj?.royalty_percent ?? 10}% royalty enforced</span>
                    </div>
                  </div>
                  {seats.length > 1 && (
                    <div style={{ marginTop: '5px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      + {seats.length - 1} more ticket{seats.length > 2 ? 's' : ''} will be minted
                    </div>
                  )}
                </div>
              )}

              <div className="seats-header">
                <h3>Tickets to Mint</h3>
                <button type="button" className="btn btn-outline btn-sm" onClick={addSeat}>+ Add</button>
              </div>

              {/* Seat column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr auto', gap: '7px', padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                {['Seat', 'Price (XRP)', 'Max Resale', ''].map(h => (
                  <span key={h} style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)' }}>{h}</span>
                ))}
              </div>

              <div className="seats-list">
                {seats.map((seat, i) => (
                  <div key={i} className="seat-row">
                    <div className="form-group" style={{ margin: 0 }}>
                      <input type="text" value={seat.seat} onChange={e => updateSeat(i, 'seat', e.target.value)} style={{ padding: '5px 8px' }} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <input type="number" value={seat.originalPrice} onChange={e => updateSeat(i, 'originalPrice', e.target.value)} style={{ padding: '5px 8px' }} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <input type="number" value={seat.maxResalePrice} onChange={e => updateSeat(i, 'maxResalePrice', e.target.value)} style={{ padding: '5px 8px' }} />
                    </div>
                    {seats.length > 1 && (
                      <button type="button" className="btn-icon-remove" onClick={() => removeSeat(i)}>&times;</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mint-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleMint}
                  disabled={minting || !selectedEvent || seats.length === 0}
                >
                  {minting ? <><span className="spinner" />Minting on XRPL…</> : `Mint ${seats.length} Ticket${seats.length !== 1 ? 's' : ''}`}
                </button>
                {minting && (
                  <div className="mint-progress" style={{ marginTop: '10px' }}>
                    Minting on XRP Ledger — ~5s per ticket. Please wait…
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
