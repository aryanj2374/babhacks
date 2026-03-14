import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function DashboardPage() {
  const { user } = useAuth();
  const [balances, setBalances] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [funding, setFunding] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [balData, tickData] = await Promise.all([
      api('/wallet/balance'),
      api('/tickets/my'),
    ]);
    if (balData.success) setBalances(balData);
    if (tickData.success) setTickets(tickData.tickets);
    setLoading(false);
  }

  async function handleFundRLUSD() {
    setFunding(true);
    const data = await api('/wallet/fund-rlusd', 'POST', { amount: '500' });
    if (data.success) {
      await loadData();
    } else {
      alert(data.error);
    }
    setFunding(false);
  }

  if (loading) {
    return <div className="page-loader"><div className="loader-spinner" /><p>Loading dashboard...</p></div>;
  }

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {user?.displayName}</p>
      </div>

      {/* Wallet Section */}
      <section className="section">
        <h2 className="section-title">
          <span className="section-icon">💳</span> Wallet
        </h2>
        <div className="wallet-overview">
          <div className="balance-card">
            <div className="balance-label">XRP Balance</div>
            <div className="balance-value">{balances?.balances?.xrp || '0'} <span className="balance-unit">XRP</span></div>
            <div className="balance-sub">{balances?.address?.slice(0, 12)}...{balances?.address?.slice(-6)}</div>
          </div>
          <div className="balance-card accent">
            <div className="balance-label">RLUSD Balance</div>
            <div className="balance-value">{balances?.balances?.rlusd || '0'} <span className="balance-unit">RLUSD</span></div>
            <button
              className="btn btn-sm btn-outline"
              onClick={handleFundRLUSD}
              disabled={funding}
            >
              {funding ? '⏳ Funding...' : '💰 Get 500 RLUSD'}
            </button>
          </div>
        </div>

        <div className="wallet-address-full">
          <span className="address-label">XRPL Address:</span>
          <code className="address-code">{balances?.address}</code>
        </div>
      </section>

      {/* Recent Tickets */}
      <section className="section">
        <h2 className="section-title">
          <span className="section-icon">🎫</span> My Tickets ({tickets.length})
        </h2>
        {tickets.length === 0 ? (
          <div className="empty-state">
            <p>No tickets yet. Visit the <a href="/marketplace">marketplace</a> to buy your first ticket!</p>
          </div>
        ) : (
          <div className="ticket-grid">
            {tickets.slice(0, 4).map(t => (
              <div key={t.id} className="ticket-card-mini">
                <div className="ticket-mini-event">{t.event_name}</div>
                <div className="ticket-mini-seat">{t.seat}</div>
                <div className="ticket-mini-date">{new Date(t.event_date).toLocaleDateString()}</div>
                {t.redeemed ? (
                  <span className="badge badge-used">Redeemed</span>
                ) : (
                  <span className="badge badge-valid">Valid</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Role Info */}
      <section className="section">
        <h2 className="section-title">
          <span className="section-icon">ℹ️</span> Account Info
        </h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Role</span>
            <span className="info-value role-badge-lg">{user?.role === 'organizer' ? '🏢 Organizer' : '🎵 Fan'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Email</span>
            <span className="info-value">{user?.email}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Network</span>
            <span className="info-value">XRPL Testnet</span>
          </div>
        </div>
      </section>
    </div>
  );
}
