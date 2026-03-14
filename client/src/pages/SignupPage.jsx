import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TicketIcon, MusicIcon, BuildingIcon, LinkIcon } from '../components/Icons';

export default function SignupPage() {
  const { signup } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'fan',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await signup(form.email, form.password, form.displayName, form.role);
      if (!data.success) setError(data.error);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <TicketIcon size={20} />
          </div>
          <h1>Create account</h1>
          <p>OpenTix ticketing on the XRP Ledger</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={form.displayName}
              onChange={e => update('displayName', e.target.value)}
              placeholder="Your name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label>Account Type</label>
            <div className="role-selector">
              <button
                type="button"
                className={`role-btn ${form.role === 'fan' ? 'active' : ''}`}
                onClick={() => update('role', 'fan')}
              >
                <MusicIcon size={16} />
                <div>
                  <span className="role-label">Fan</span>
                  <span className="role-desc">Buy &amp; collect tickets</span>
                </div>
              </button>
              <button
                type="button"
                className={`role-btn ${form.role === 'organizer' ? 'active' : ''}`}
                onClick={() => update('role', 'organizer')}
              >
                <BuildingIcon size={16} />
                <div>
                  <span className="role-label">Organizer</span>
                  <span className="role-desc">Create events &amp; mint</span>
                </div>
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <><span className="spinner" />Creating wallet…</> : 'Create Account'}
          </button>

          {loading && (
            <div className="auth-info">
              Creating your XRPL wallet and funding with Testnet XRP. This may take 10–20 seconds…
            </div>
          )}
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>

      <div className="auth-badge">
        <LinkIcon size={11} /> XRP Ledger Testnet
      </div>
    </div>
  );
}
