import { useState, useRef, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TicketIcon, ChevronDownIcon, SettingsIcon, LogOutIcon } from './Icons';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <NavLink to="/dashboard" className="nav-brand">
          <TicketIcon size={18} className="brand-icon-svg" />
          <span className="brand-text">OpenTix</span>
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
              Mint
            </NavLink>
          )}
          <NavLink to="/verify" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Verify
          </NavLink>
        </div>

        <div className="nav-user" ref={dropdownRef}>
          <button className="nav-profile-btn" onClick={() => setOpen(o => !o)}>
            <div className="nav-avatar">{initials}</div>
            <span className="nav-username">{user?.displayName}</span>
            <ChevronDownIcon size={13} className={`nav-chevron ${open ? 'open' : ''}`} />
          </button>

          {open && (
            <div className="profile-dropdown">
              <div className="pd-header">
                <div className="pd-avatar">{initials}</div>
                <div className="pd-info">
                  <div className="pd-name">{user?.displayName}</div>
                  <div className="pd-email">{user?.email}</div>
                  <span className="nav-role-badge">{user?.role}</span>
                </div>
              </div>
              <div className="pd-divider" />
              <Link to="/settings" className="pd-item" onClick={() => setOpen(false)}>
                <SettingsIcon size={15} /> Settings
              </Link>
              <button className="pd-item pd-item-danger" onClick={handleLogout}>
                <LogOutIcon size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
