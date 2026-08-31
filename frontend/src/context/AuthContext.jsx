import { useState, useEffect } from 'react';
import client from '../api/client';
import { AuthContext } from './authContextInstance';

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  // Solo hay algo que esperar si ya existe un token guardado; si no, arranca
  // sin loading (evita tener que "apagarlo" sincrónicamente dentro del efecto).
  const [loading, setLoading] = useState(() => !!localStorage.getItem('token'));

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    client.get('/auth/me')
      .then(res => setUser(res.data.user))
      .catch(()  => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await client.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}