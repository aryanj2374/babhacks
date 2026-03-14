import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function VerifyPage() {
  const { user } = useAuth();
  const [ticketId, setTicketId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  async function handleVerify(e) {
    e.preventDefault();
    if (!ticketId.trim()) return;
    setLoading(true);
    setResult(null);
    const data = await api(`/verify/${ticketId.trim()}`);
    if (data.success) {
      setResult(data.verification);
    } else {
      setResult({ valid: false, message: `❌ ${data.error}` });
    }
    setLoading(false);
  }

  async function handleRedeem() {
    setRedeeming(true);
    const data = await api(`/verify/${ticketId.trim()}/redeem`, 'POST');
    if (data.success) {
      setResult(prev => ({
        ...prev,
        redeemed: true,
        valid: false,
        message: '✅ Ticket has been redeemed!',
      }));
    } else {
      alert(data.error);
    }
    setRedeeming(false);
  }

  return (
    <div className="page verify-page">
      <div className="page-header">
        <h1>Verify Ticket</h1>
        <p>Check ticket authenticity and ownership on the XRP Ledger</p>
      </div>

      <section className="section">
        <div className="verify-card">
          <form onSubmit={handleVerify} className="verify-form">
            <div className="form-group">
              <label>Ticket ID</label>
              <input
                type="text"
                value={ticketId}
                onChange={e => setTicketId(e.target.value)}
                placeholder="Enter ticket ID or scan QR code"
                className="verify-input"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '⏳ Verifying...' : '🔍 Verify Ticket'}
            </button>
          </form>

          {result && (
            <div className={`verify-result ${result.valid ? 'valid' : result.redeemed ? 'redeemed' : 'invalid'}`}>
              <div className="verify-status">
                <span className="verify-icon">
                  {result.valid ? '✅' : result.redeemed ? '⚠️' : '❌'}
                </span>
                <span className="verify-message">{result.message}</span>
              </div>

              {result.eventName && (
                <div className="verify-details">
                  <div className="detail-row">
                    <span className="detail-label">Event</span>
                    <span className="detail-value">{result.eventName}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Date</span>
                    <span className="detail-value">{new Date(result.eventDate).toLocaleDateString()}</span>
                  </div>
                  {result.venue && (
                    <div className="detail-row">
                      <span className="detail-label">Venue</span>
                      <span className="detail-value">{result.venue}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="detail-label">Seat</span>
                    <span className="detail-value">{result.seat}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Owner</span>
                    <span className="detail-value">{result.ownerName || 'Unknown'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">On-Chain</span>
                    <span className="detail-value">{result.onChainValid ? '✅ Verified' : '⚠️ Unverified'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Redeemed</span>
                    <span className="detail-value">{result.redeemed ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              )}

              {user?.role === 'organizer' && result.valid && !result.redeemed && (
                <button
                  className="btn btn-primary btn-full"
                  onClick={handleRedeem}
                  disabled={redeeming}
                  style={{ marginTop: '16px' }}
                >
                  {redeeming ? '⏳ Redeeming...' : '✅ Redeem Ticket'}
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
