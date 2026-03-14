import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrCodes, setQrCodes] = useState({});
  const [listing, setListing] = useState(null);
  const [listPrice, setListPrice] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    setLoading(true);
    const data = await api('/tickets/my');
    if (data.success) setTickets(data.tickets);
    setLoading(false);
  }

  async function loadQR(ticketId) {
    if (qrCodes[ticketId]) {
      setQrCodes(prev => ({ ...prev, [ticketId]: null }));
      return;
    }
    const data = await api(`/tickets/${ticketId}/qr`);
    if (data.success) {
      setQrCodes(prev => ({ ...prev, [ticketId]: data.qrCode }));
    }
  }

  async function handleListForSale(ticketId) {
    if (!listPrice) return;
    setMessage(null);
    const data = await api('/tickets/list-for-sale', 'POST', {
      ticketId,
      resalePrice: listPrice,
    });
    if (data.success) {
      setMessage({ type: 'success', text: '✅ Ticket listed for sale!' });
      setListing(null);
      setListPrice('');
      await loadTickets();
    } else {
      setMessage({ type: 'error', text: `❌ ${data.error}` });
    }
  }

  if (loading) {
    return <div className="page-loader"><div className="loader-spinner" /><p>Loading tickets...</p></div>;
  }

  return (
    <div className="page my-tickets-page">
      <div className="page-header">
        <h1>My Tickets</h1>
        <p>Your NFT ticket collection</p>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {tickets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎫</div>
          <h3>No tickets yet</h3>
          <p>Visit the <a href="/marketplace">marketplace</a> to get your first ticket!</p>
        </div>
      ) : (
        <div className="my-tickets-grid">
          {tickets.map(t => (
            <div key={t.id} className={`my-ticket-card ${t.redeemed ? 'redeemed' : ''}`}>
              <div className="my-ticket-top">
                <div className="my-ticket-event">{t.event_name}</div>
                {t.redeemed ? (
                  <span className="badge badge-used">Redeemed</span>
                ) : (
                  <span className="badge badge-valid">Valid</span>
                )}
              </div>

              <div className="my-ticket-details">
                <div className="detail-row">
                  <span className="detail-label">Seat</span>
                  <span className="detail-value">{t.seat}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Event Date</span>
                  <span className="detail-value">{new Date(t.event_date).toLocaleDateString()}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Venue</span>
                  <span className="detail-value">{t.event_venue || 'TBD'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Price Paid</span>
                  <span className="detail-value">{t.original_price} RLUSD</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Max Resale</span>
                  <span className="detail-value">{t.max_resale_price} RLUSD</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Resales</span>
                  <span className="detail-value">{t.resale_count}/{t.max_resales}</span>
                </div>
              </div>

              <div className="my-ticket-actions">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => loadQR(t.id)}
                >
                  {qrCodes[t.id] ? '✕ Hide QR' : '📱 Show QR'}
                </button>
                {!t.redeemed && t.resale_count < t.max_resales && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setListing(listing === t.id ? null : t.id)}
                  >
                    💸 {listing === t.id ? 'Cancel' : 'List for Sale'}
                  </button>
                )}
              </div>

              {qrCodes[t.id] && (
                <div className="qr-section">
                  <img src={qrCodes[t.id]} alt="Ticket QR Code" className="qr-image" />
                  <p className="qr-hint">Show this QR code at the venue entrance</p>
                </div>
              )}

              {listing === t.id && (
                <div className="list-section">
                  <div className="list-form">
                    <input
                      type="number"
                      value={listPrice}
                      onChange={e => setListPrice(e.target.value)}
                      placeholder={`Max: ${t.max_resale_price} RLUSD`}
                      className="list-input"
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleListForSale(t.id)}
                    >
                      List
                    </button>
                  </div>
                  <p className="list-hint">Max allowed: {t.max_resale_price} RLUSD (anti-scalping)</p>
                </div>
              )}

              <div className="my-ticket-nft">
                <span className="nft-label">NFT ID:</span>
                <code className="nft-id">{t.token_id?.slice(0, 20)}...</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
