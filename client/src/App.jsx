import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import MarketplacePage from './pages/MarketplacePage';
import MyTicketsPage from './pages/MyTicketsPage';
import MintPage from './pages/MintPage';
import VerifyPage from './pages/VerifyPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loader">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function OrganizerRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loader">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'organizer') return <Navigate to="/dashboard" />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loader-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {user && <Navbar />}
      <main className="main-content">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
          <Route path="/signup" element={user ? <Navigate to="/dashboard" /> : <SignupPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/marketplace" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
          <Route path="/my-tickets" element={<ProtectedRoute><MyTicketsPage /></ProtectedRoute>} />
          <Route path="/mint" element={<OrganizerRoute><MintPage /></OrganizerRoute>} />
          <Route path="/verify" element={<ProtectedRoute><VerifyPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
        </Routes>
      </main>
    </div>
  );
}
