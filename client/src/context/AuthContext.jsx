import { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, clearToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api('/auth/me')
        .then(data => {
          if (data.success) setUser(data.user);
          else clearToken();
        })
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await api('/auth/login', 'POST', { email, password });
    if (data.success) {
      setToken(data.token);
      setUser(data.user);
    }
    return data;
  };

  const signup = async (email, password, displayName, role) => {
    const data = await api('/auth/signup', 'POST', { email, password, displayName, role });
    if (data.success) {
      setToken(data.token);
      setUser(data.user);
    }
    return data;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
