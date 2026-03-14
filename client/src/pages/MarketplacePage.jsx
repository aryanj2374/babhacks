import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function MarketplacePage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [evData, tkData] = await Promise.all([
      api('/events'),
      api('/tickets/marketplace'),
    ]);
    if (evData.success) setEvents(evData.events);
    if (tkData.success) setTickets(tkData.tickets);
    setLoading(false);
  }

  async function handleBuy(ticket) {
    if (!confirm(`Buy ticket ${ticket.seat} for ${ticket.listingPrice} RLUSD?`)) return;
    setBuying(ticket.id);
    setMessage(null);
    const data = await api('/tickets/buy', 'POST', { ticketId: ticket.id });
    if (data.success) {
      setMessage({ type: 'success', text: `✅ ${data.message}` });
      await loadData();
    } else {
      setMessage({ type: 'error', text: `❌ ${data.error}` });
    }
    setBuying(null);
  }

  if (loading) {
    return <div className="page-loader"><div className="loader-spinner" /><p>Loading marketplace...</p></div>;
  }

  return (
    <div className="page marketplace-page">
      <div className="page-header">
        <h1>Marketplace</h1>
        <p>Browse events and buy NFT tickets with RLUSD</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      {/* Events Section */}
      {events.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            <span className="section-icon">🎪</span> Events
          </h2>
          <div className="event-grid">
            {events.map(ev => (
              <div key={ev.id} className="event-card">
                <div className="event-card-header">
                  <span className="event-emoji">🎵</span>
                  <div className="event-meta">
                    <div className="event-date">{new Date(ev.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    <div className="event-organizer">by {ev.organizer_name}</div>
                  </div>
                </div>
                <h3 className="event-name">{ev.name}</h3>
                {ev.venue && <p className="event-venue">📍 {ev.venue}</p>}
                {ev.description && <p className="event-desc">{ev.description}</p>}
                <div className="event-stats">
                  <span className="stat">{ev.available_tickets} available</span>
                  <span className="stat">{ev.total_tickets} total</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Available Tickets */}
      <section className="section">
        <h2 className="section-title">
          <span className="section-icon">🎫</span> Available Tickets
        </h2>
        {tickets.length === 0 ? (
          <div className="empty-state">
            <p>No tickets available right now. Check back soon!</p>
          </div>
        ) : (
          <div className="ticket-grid-marketplace">
            {tickets.map(t => (
              <div key={t.id} className="marketplace-ticket-card">
                <div className="mt-card-top">
                  {t.isResale && <span className="resale-badge">Resale</span>}
                  <span className="mt-event-name">{t.event_name}</span>
                </div>
                <div className="mt-card-body">
                  <div className="mt-seat">{t.seat}</div>
                  <div className="mt-date">{new Date(t.event_date).toLocaleDateString()}</div>
                  {t.event_venue && <div className="mt-venue">📍 {t.event_venue}</div>}
                </div>
                <div className="mt-card-footer">
                  <div className="mt-price">
                    <span className="price-value">{t.listingPrice}</span>
                    <span className="price-unit">RLUSD</span>
                  </div>
                  {t.current_owner_id !== user?.id ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleBuy(t)}
                      disabled={buying === t.id}
                    >
                      {buying === t.id ? '⏳ Buying...' : '🛒 Buy'}
                    </button>
                  ) : (
                    <span className="badge badge-owned">You own this</span>
                  )}
                </div>
                <div className="mt-anti-scalp">
                  Max resale: {t.max_resale_price} RLUSD · {t.max_resales - t.resale_count} resales left
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
