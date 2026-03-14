import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { TicketIcon, QrCodeIcon, XCircleIcon, TagIcon, ShieldCheckIcon, ZapIcon } from '../components/Icons';

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrCodes, setQrCodes] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [listing, setListing] = useState(null);
  const [listPrice, setListPrice] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => { loadTickets(); }, []);

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
    if (data.success) setQrCodes(prev => ({ ...prev, [ticketId]: data.qrCode }));
  }

  async function handleListForSale(ticketId) {
    if (!listPrice) return;
    setMessage(null);
    const data = await api('/tickets/list-for-sale', 'POST', { ticketId, resalePrice: listPrice });
    if (data.success) {
      setMessage({ type: 'success', text: 'Ticket listed for sale!' });
      setListing(null);
      setListPrice('');
      await loadTickets();
    } else {
      setMessage({ type: 'error', text: data.error });
    }
  }

  function toggleExpand(id) {
    setExpanded(expanded === id ? null : id);
    setListing(null);
    setListPrice('');
  }

  if (loading) {
    return <div className="page-loader"><div className="loader-spinner" /><p>Loading tickets…</p></div>;
  }

  const validCount = tickets.filter(t => !t.redeemed).length;
  const redeemedCount = tickets.filter(t => t.redeemed).length;
  const listedCount = tickets.filter(t => !t.redeemed && (t.resale_count > 0 || t.max_resales === 0)).length;

  const colStyle = { fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.9px', color: 'var(--text-muted)' };

  return (
    <div className="page my-tickets-page">
      <div className="page-header">
        <h1>My Tickets</h1>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* Summary stats bar */}
      {tickets.length > 0 && (
        <div className="ticket-summary-bar">
          <div className="tsb-card">
            <div className="tsb-icon total"><TicketIcon size={13} /></div>
            <div className="tsb-info">
              <div className="tsb-num">{tickets.length}</div>
              <div className="tsb-label">Total</div>
            </div>
          </div>
          <div className="tsb-card">
            <div className="tsb-icon valid"><ShieldCheckIcon size={13} /></div>
            <div className="tsb-info">
              <div className="tsb-num">{validCount}</div>
              <div className="tsb-label">Valid</div>
            </div>
          </div>
          <div className="tsb-card">
            <div className="tsb-icon listed"><TagIcon size={13} /></div>
            <div className="tsb-info">
              <div className="tsb-num">{listedCount}</div>
              <div className="tsb-label">Sellable</div>
            </div>
          </div>
          <div className="tsb-card">
            <div className="tsb-icon used"><ZapIcon size={13} /></div>
            <div className="tsb-info">
              <div className="tsb-num">{redeemedCount}</div>
              <div className="tsb-label">Redeemed</div>
            </div>
          </div>
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <TicketIcon size={36} style={{ color: 'var(--text-muted)', marginBottom: '10px' }} />
            <h3>No tickets yet</h3>
            <p>Visit the <a href="/marketplace">marketplace</a> to get your first ticket.</p>
          </div>
        </div>
      ) : (
        <div className="panel">
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px 106px 90px 68px 110px', padding: '7px 14px', borderBottom: '1px solid var(--border-subtle)', gap: '10px' }}>
            {['Event', 'Seat', 'Date', 'Price', 'Status', ''].map(h => (
              <span key={h} style={colStyle}>{h}</span>
            ))}
          </div>

          <div className="tickets-list">
            {tickets.map(t => (
              <div key={t.id} className={`ticket-row ${t.redeemed ? 'redeemed' : ''}`}>
                <div className="ticket-row-main" onClick={() => toggleExpand(t.id)}>
                  <span className="tr-event">{t.event_name}</span>
                  <span className="tr-seat">{t.seat}</span>
                  <span className="tr-date">{new Date(t.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="tr-price">{t.original_price}</span>
                  <span>
                    {t.redeemed
                      ? <span className="badge badge-used">Used</span>
                      : <span className="badge badge-valid">Valid</span>
                    }
                  </span>
                  <span className="tr-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-outline btn-sm" onClick={() => loadQR(t.id)}>
                      {qrCodes[t.id] ? <><XCircleIcon size={12} />QR</> : <><QrCodeIcon size={12} />QR</>}
                    </button>
                    {!t.redeemed && (t.resale_count > 0 || t.max_resales === 0) && (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => { setListing(listing === t.id ? null : t.id); if (expanded !== t.id) setExpanded(t.id); }}
                      >
                        {listing === t.id ? 'Cancel' : 'Sell'}
                      </button>
                    )}
                  </span>
                </div>

                {(expanded === t.id || qrCodes[t.id]) && (
                  <div className="ticket-row-extra" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      {/* Mini ticket stub visual */}
                      <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.07), rgba(139,92,246,0.04))', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '10px' }}>
                        <div style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.2), rgba(139,92,246,0.12))', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{t.event_name}</span>
                          <span style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '1px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }}>{t.seat}</span>
                        </div>
                        <div style={{ height: '1px', background: 'repeating-linear-gradient(90deg, var(--border-glass) 0px, var(--border-glass) 5px, transparent 5px, transparent 10px)' }} />
                        <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                          {[
                            ['Venue', t.event_venue || 'TBD'],
                            ['Price Paid', `${t.original_price} RLUSD`],
                            ['Max Resale', `${t.max_resale_price} RLUSD`],
                            ['Resales Left', t.max_resales === 0 ? 'Unlimited' : `${t.resale_count} / ${t.max_resales}`],
                          ].map(([label, val]) => (
                            <div key={label} className="detail-row">
                              <span className="detail-label">{label}</span>
                              <span className="detail-value">{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {t.token_id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="nft-label">NFT</span>
                          <code className="nft-id">{t.token_id.slice(0, 28)}…</code>
                        </div>
                      )}
                    </div>

                    {qrCodes[t.id] && (
                      <div style={{ textAlign: 'center' }}>
                        <img src={qrCodes[t.id]} alt="QR" style={{ width: '120px', height: '120px', borderRadius: 'var(--radius-md)', display: 'block', marginBottom: '4px' }} />
                        <p className="qr-hint">Show at venue</p>
                      </div>
                    )}

                    {listing === t.id && (
                      <div style={{ minWidth: '170px' }}>
                        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600, marginBottom: '6px' }}>Set Resale Price</div>
                        <div className="list-form">
                          <input
                            type="number"
                            value={listPrice}
                            onChange={e => setListPrice(e.target.value)}
                            placeholder={`Max ${t.max_resale_price}`}
                            className="list-input"
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => handleListForSale(t.id)}>List</button>
                        </div>
                        <p className="list-hint">Max: {t.max_resale_price} RLUSD</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
