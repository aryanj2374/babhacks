import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <NavLink to="/dashboard" className="nav-brand">
          <span className="brand-icon">🎫</span>
          <span className="brand-text">AntiScalp</span>
        </NavLink>

        <div className="nav-links">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="/marketplace" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Marketplace
          </NavLink>
          <NavLink to="/my-tickets" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            My Tickets
          </NavLink>
          {user?.role === 'organizer' && (
            <NavLink to="/mint" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Mint Tickets
            </NavLink>
          )}
          <NavLink to="/verify" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Verify
          </NavLink>
        </div>

        <div className="nav-user">
          <span className="nav-role-badge">{user?.role}</span>
          <span className="nav-username">{user?.displayName}</span>
          <button onClick={handleLogout} className="nav-logout-btn">Logout</button>
        </div>
      </div>
    </nav>
  );
}
