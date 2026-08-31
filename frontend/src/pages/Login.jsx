import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <span style={styles.pill}>CURF</span>
          <h2 style={styles.title}>Sistema de Nomenclatura</h2>
          <p style={styles.sub}>Ingresá con tu cuenta institucional</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Correo institucional</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@curf.net"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh', background: '#f4f3ef',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    background: '#fff', border: '1px solid #dddbd3',
    borderRadius: 12, padding: '36px 32px',
    width: '100%', maxWidth: 380,
  },
  brand: { textAlign: 'center', marginBottom: 28 },
  pill: {
    background: '#1a52be', color: '#fff',
    fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
    padding: '3px 10px', borderRadius: 4, letterSpacing: 1,
  },
  title: { fontSize: 18, fontWeight: 700, margin: '12px 0 4px' },
  sub:   { fontSize: 13, color: '#999', margin: 0 },
  form:  { display: 'flex', flexDirection: 'column', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: '#585754' },
  input: {
    border: '1px solid #c8c6bc', borderRadius: 6,
    padding: '9px 12px', fontSize: 13, outline: 'none',
    background: '#fff', color: '#1a1a18',
  },
  error: {
    background: '#fceaea', color: '#b83030',
    border: '1px solid #f0b0b0', borderRadius: 6,
    padding: '8px 12px', fontSize: 12,
  },
  btn: {
    background: '#1a52be', color: '#fff', border: 'none',
    borderRadius: 6, padding: '10px', fontSize: 14,
    fontWeight: 600, cursor: 'pointer', marginTop: 4,
  },
};