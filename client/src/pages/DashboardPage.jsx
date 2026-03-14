import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { WalletIcon, TicketIcon, ZapIcon, TagIcon } from '../components/Icons';

export default function DashboardPage() {
  const { user } = useAuth();
  const [balances, setBalances] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [funding, setFunding] = useState(false);

  useEffect(() => { loadData(); }, []);

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
    if (data.success) await loadData();
    else alert(data.error);
    setFunding(false);
  }

  if (loading) {
    return <div className="page-loader"><div className="loader-spinner" /><p>Loading...</p></div>;
  }

  const validCount = tickets.filter(t => !t.redeemed).length;
  const redeemedCount = tickets.filter(t => t.redeemed).length;

  // Build activity feed from tickets
  const activity = tickets.slice(0, 6).map(t => ({
    type: t.resale_count > 0 ? 'buy' : 'mint',
    title: t.event_name,
    sub: `${t.seat} · ${new Date(t.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    tag: t.resale_count > 0 ? 'Purchased' : 'Minted',
  }));

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="page-header p">Welcome back, {user?.displayName}</span>
      </div>

      {/* Stat row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">XRP Balance</div>
          <div className="stat-value">
            {balances?.balances?.xrp || '0'}
            <span className="stat-unit"> XRP</span>
          </div>
          <div className="stat-sub" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            {balances?.address ? `${balances.address.slice(0, 10)}…${balances.address.slice(-5)}` : '—'}
          </div>
        </div>

        <div className="stat-card accent">
          <div className="stat-label">RLUSD Balance</div>
          <div className="stat-value">
            {balances?.balances?.rlusd || '0'}
            <span className="stat-unit"> RLUSD</span>
          </div>
          <div style={{ marginTop: '6px' }}>
            <button className="btn btn-outline btn-sm" onClick={handleFundRLUSD} disabled={funding}>
              {funding ? <><span className="spinner" />Funding…</> : '+ Get 500 RLUSD'}
            </button>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Tickets</div>
          <div className="stat-value">{tickets.length}</div>
          <div className="stat-sub">{validCount} valid · {redeemedCount} redeemed</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="dash-grid">
        {/* Left: ticket table + activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">
                <TicketIcon size={11} /> Recent Tickets
              </span>
              {tickets.length > 0 && (
                <Link to="/my-tickets" style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', textDecoration: 'none' }}>
                  View all →
                </Link>
              )}
            </div>
            {tickets.length === 0 ? (
              <div className="empty-state">
                <p>No tickets yet. <Link to="/marketplace" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>Browse marketplace</Link></p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Seat</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.slice(0, 8).map(t => (
                    <tr key={t.id}>
                      <td className="td-primary">{t.event_name}</td>
                      <td className="td-mono">{t.seat}</td>
                      <td className="td-muted">{new Date(t.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td>
                        {t.redeemed
                          ? <span className="badge badge-used">Redeemed</span>
                          : <span className="badge badge-valid">Valid</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Activity Feed */}
          {activity.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title"><ZapIcon size={11} /> Activity</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{activity.length} events</span>
              </div>
              <div className="activity-feed">
                {activity.map((item, i) => (
                  <div key={i} className="activity-item">
                    <div className="activity-dot-wrap">
                      <div className={`activity-dot ${item.type}`} />
                    </div>
                    <div className="activity-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span className="activity-title">{item.title}</span>
                        <span className={`activity-tag ${item.type}`}>{item.tag}</span>
                      </div>
                      <div className="activity-meta">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: wallet + account + network */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title"><WalletIcon size={11} /> Wallet</span>
            </div>
            <div className="wallet-address-full">
              <span className="address-label">Address</span>
              <code className="address-code">{balances?.address || '—'}</code>
            </div>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>XRP</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600 }}>{balances?.balances?.xrp || '0'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>RLUSD</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-primary)' }}>{balances?.balances?.rlusd || '0'}</span>
              </div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <button className="btn btn-outline btn-sm btn-full" onClick={handleFundRLUSD} disabled={funding}>
                {funding ? <><span className="spinner" />Funding…</> : '+ Get 500 RLUSD'}
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Account</span>
            </div>
            <div style={{ padding: '0' }}>
              {[
                { label: 'Role', value: <span className="settings-role">{user?.role}</span> },
                { label: 'Email', value: user?.email },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Network Status */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title"><TagIcon size={11} /> Network</span>
              <div className="net-live">
                <div className="net-dot" />
                <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>Live</span>
              </div>
            </div>
            <div className="net-row">
              <span className="net-label">Chain</span>
              <span className="net-val accent">XRPL Testnet</span>
            </div>
            <div className="net-row">
              <span className="net-label">Standard</span>
              <span className="net-val">XLS-20 NFT</span>
            </div>
            <div className="net-row">
              <span className="net-label">Currency</span>
              <span className="net-val">RLUSD (simulated)</span>
            </div>
            <div className="net-row">
              <span className="net-label">Royalty</span>
              <span className="net-val">10% (on-chain)</span>
            </div>
            <div className="net-row">
              <span className="net-label">Endpoint</span>
              <span className="net-val" style={{ fontSize: '0.62rem' }}>s.altnet.rippletest.net</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
