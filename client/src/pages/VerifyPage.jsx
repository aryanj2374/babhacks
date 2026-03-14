import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ShieldCheckIcon } from '../components/Icons';

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
      setResult({ valid: false, message: data.error });
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
        message: 'Ticket has been redeemed!',
      }));
    } else {
      alert(data.error);
    }
    setRedeeming(false);
  }

  const statusKey = result?.valid ? 'valid' : result?.redeemed ? 'redeemed' : result ? 'invalid' : null;

  return (
    <div className="page verify-page">
      <div className="page-header">
        <h1>Verify Ticket</h1>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Check authenticity on the XRP Ledger</span>
      </div>

      <div className="verify-wrap">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title"><ShieldCheckIcon size={11} /> Ticket Verification</span>
          </div>
          <div style={{ padding: '14px' }}>
            <form onSubmit={handleVerify} style={{ display: 'flex', gap: '8px' }}>
              <div className="form-group" style={{ margin: 0, flex: 1 }}>
                <input
                  type="text"
                  value={ticketId}
                  onChange={e => setTicketId(e.target.value)}
                  placeholder="Enter ticket ID or scan QR code"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ whiteSpace: 'nowrap' }}>
                {loading ? <><span className="spinner" />Verifying…</> : 'Verify'}
              </button>
            </form>
          </div>

          {/* Non-stub error/redeemed state */}
          {result && !result.valid && (
            <div style={{ padding: '0 14px 14px' }}>
              <div className={`verify-result ${statusKey}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {statusKey === 'redeemed'
                    ? <AlertTriangleIcon size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                    : <XCircleIcon size={16} style={{ color: 'var(--error)', flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{result.message}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Valid ticket stub */}
        {result?.valid && result.eventName && (
          <div className="ticket-stub-wrap" style={{ marginTop: '10px' }}>
            <div className="ticket-stub">
              <div className="ticket-stub-header">
                <div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px', opacity: 0.75 }}>Valid Ticket</div>
                  <div className="ticket-stub-event">{result.eventName}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircleIcon size={18} style={{ color: 'rgba(255,255,255,0.9)' }} />
                  <span className="ticket-stub-status">Authentic</span>
                </div>
              </div>

              <div className="ticket-stub-body">
                {[
                  ['Seat', result.seat],
                  ['Owner', result.ownerName || 'Unknown'],
                  ['Date', new Date(result.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
                  result.venue ? ['Venue', result.venue] : null,
                  ['On-Chain', result.onChainValid ? 'Verified ✓' : 'Unverified'],
                  ['Redeemed', result.redeemed ? 'Yes' : 'No'],
                ].filter(Boolean).map(([label, val]) => (
                  <div key={label} className="ticket-stub-field">
                    <div className="tsf-label">{label}</div>
                    <div className="tsf-val">{val}</div>
                  </div>
                ))}
              </div>

              <div className="ticket-stub-tear" />

              <div className="ticket-stub-footer">
                <div className="ticket-stub-chain">
                  <div className="ticket-stub-chain-dot" />
                  XRPL Testnet · XLS-20 NFT
                </div>
                <div className="ticket-stub-id">{ticketId.slice(0, 16)}…</div>
              </div>
            </div>

            {user?.role === 'organizer' && result.valid && !result.redeemed && (
              <button
                className="btn btn-primary btn-full"
                onClick={handleRedeem}
                disabled={redeeming}
                style={{ marginTop: '8px' }}
              >
                {redeeming ? <><span className="spinner" />Redeeming…</> : 'Mark as Redeemed'}
              </button>
            )}
          </div>
        )}

        <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', gap: '16px' }}>
          <span>Network: <strong style={{ color: 'var(--text-secondary)' }}>XRPL Testnet</strong></span>
          <span>Verification: <strong style={{ color: 'var(--text-secondary)' }}>On-chain NFT</strong></span>
        </div>
      </div>
    </div>
  );
}
