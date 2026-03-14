import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { CalendarIcon, TagIcon, MapPinIcon, ShoppingCartIcon, ZapIcon } from '../components/Icons';

export default function MarketplacePage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => { loadData(); }, []);

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
    if (!confirm(`Buy ticket ${ticket.seat} for ${ticket.listingPrice} XRP?`)) return;
    setBuying(ticket.id);
    setMessage(null);
    const data = await api('/tickets/buy', 'POST', { ticketId: ticket.id });
    if (data.success) {
      setMessage({ type: 'success', text: data.message });
      await loadData();
    } else {
      setMessage({ type: 'error', text: data.error });
    }
    setBuying(null);
  }

  if (loading) {
    return <div className="page-loader"><div className="loader-spinner" /><p>Loading marketplace…</p></div>;
  }

  const featured = events[0];

  return (
    <div className="page marketplace-page">
      <div className="page-header">
        <h1>Marketplace</h1>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} available
        </span>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* Featured event banner */}
      {featured && (
        <div className="featured-banner">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="featured-eyebrow">Featured Event</div>
            <div className="featured-title">{featured.name}</div>
            <div className="featured-meta">
              <span className="featured-meta-item">
                <CalendarIcon size={11} />
                {new Date(featured.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {featured.venue && (
                <span className="featured-meta-item">
                  <MapPinIcon size={11} />{featured.venue}
                </span>
              )}
              <span className="featured-meta-item">
                <ZapIcon size={11} />{featured.available_tickets} tickets left
              </span>
            </div>
          </div>
          <div className="featured-badge">
            <div className="featured-count">{events.length}</div>
            <div className="featured-count-label">Events</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="featured-count">{tickets.length}</div>
            <div className="featured-count-label">Listings</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: events.length > 0 ? '260px 1fr' : '1fr', gap: '10px', alignItems: 'start' }}>

        {/* Events sidebar */}
        {events.length > 0 && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title"><CalendarIcon size={11} /> Events</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{events.length}</span>
            </div>
            <div className="event-list">
              {events.map(ev => (
                <div key={ev.id} className="event-row">
                  <div>
                    <div className="er-name">{ev.name}</div>
                    <div className="er-meta">
                      {ev.venue && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <MapPinIcon size={11} />{ev.venue}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="er-date">{new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    <div className="er-stat" style={{ marginTop: '2px' }}>{ev.available_tickets} left</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tickets grid */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title"><TagIcon size={11} /> Available Tickets</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{tickets.length} listings</span>
          </div>

          {tickets.length === 0 ? (
            <div className="empty-state">
              <p>No tickets available right now. Check back soon.</p>
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
                    <div className="mt-date">{new Date(t.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    {t.event_venue && (
                      <div className="mt-venue">
                        <MapPinIcon size={11} />{t.event_venue}
                      </div>
                    )}
                  </div>
                  {/* Perforated tear line */}
                  <div className="mt-tear" />
                  <div className="mt-card-footer">
                    <div>
                      <span className="price-value">{t.listingPrice}</span>
                      <span className="price-unit">XRP</span>
                    </div>
                    {t.current_owner_id !== user?.id ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleBuy(t)}
                        disabled={buying === t.id}
                      >
                        {buying === t.id
                          ? <><span className="spinner" />Buying…</>
                          : <><ShoppingCartIcon size={13} />Buy</>
                        }
                      </button>
                    ) : (
                      <span className="badge badge-owned">Yours</span>
                    )}
                  </div>
                  <div className="mt-anti-scalp">
                    Max {t.max_resale_price} RLUSD · {t.max_resales === 0 ? 'Unlimited' : t.resale_count} resales left
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
