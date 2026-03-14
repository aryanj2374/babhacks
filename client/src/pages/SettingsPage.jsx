import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { UserIcon, WalletIcon } from '../components/Icons';

export default function SettingsPage() {
  const { user } = useAuth();
  const [walletAddress, setWalletAddress] = useState(null);

  useEffect(() => {
    api('/wallet/balance').then(data => {
      if (data.success) setWalletAddress(data.address);
    });
  }, []);

  return (
    <div className="page settings-page">
      <div className="page-header">
        <h1>Settings</h1>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Account &amp; wallet configuration</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' }}>
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title"><UserIcon size={11} /> Account</span>
          </div>
          {[
            { label: 'Display Name', value: user?.displayName },
            { label: 'Email', value: user?.email },
            { label: 'Role', value: <span className="settings-role">{user?.role}</span> },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title"><WalletIcon size={11} /> Wallet</span>
          </div>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>XRPL Address</span>
            <code className="address-code" style={{ fontSize: '0.72rem' }}>{walletAddress || '—'}</code>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Network</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>XRPL Testnet</span>
          </div>
        </div>
      </div>
    </div>
  );
}
