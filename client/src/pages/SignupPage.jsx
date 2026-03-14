import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
    const data = await signup(form.email, form.password, form.displayName, form.role);
    if (!data.success) setError(data.error);
    setLoading(false);
  };

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-icon">🎫</span>
          <h1>Create Account</h1>
          <p>Join the anti-scalping ticketing revolution</p>
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
                <span className="role-icon">🎵</span>
                <span className="role-label">Fan</span>
                <span className="role-desc">Buy & collect tickets</span>
              </button>
              <button
                type="button"
                className={`role-btn ${form.role === 'organizer' ? 'active' : ''}`}
                onClick={() => update('role', 'organizer')}
              >
                <span className="role-icon">🏢</span>
                <span className="role-label">Organizer</span>
                <span className="role-desc">Create events & mint tickets</span>
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            {loading ? 'Creating wallet...' : 'Create Account'}
          </button>

          {loading && (
            <div className="auth-info">
              ⏳ Creating your XRPL wallet and funding with Testnet XRP. This may take 10–20 seconds...
            </div>
          )}
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>

      <div className="auth-badge">⛓️ Powered by XRP Ledger Testnet</div>
    </div>
  );
}
