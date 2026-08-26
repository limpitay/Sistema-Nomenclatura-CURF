import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Constructor', icon: '🏗️', end: true },
  { to: '/historial', label: 'Historial', icon: '🕘', end: false },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  const items = user?.rol === 'admin'
    ? [...NAV_ITEMS, { to: '/admin', label: 'Usuarios', icon: '👤', end: false }]
    : NAV_ITEMS;

  const initials = (user?.nombre || '?')
    .trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  return (
    <div style={s.shell}>
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <span style={s.brandBadge}>CU</span>
          <div>
            <div style={s.brandTitle}>Panel CURF</div>
            <div style={s.brandSub}>Nomenclatura</div>
          </div>
        </div>

        <nav style={s.nav}>
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({ ...s.navItem, ...(isActive ? s.navItemActive : {}) })}
            >
              <span style={s.navIcon}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={s.sidebarFooter}>
          <div style={s.userRow}>
            <span style={s.avatar}>{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div style={s.userName}>{user?.nombre}</div>
              <div style={s.userRol}>{user?.rol === 'admin' ? 'Admin' : 'Técnico'}</div>
            </div>
          </div>
          <button style={s.logoutBtn} onClick={logout}>Salir</button>
        </div>
      </aside>

      <main style={s.main}>{children}</main>
    </div>
  );
}

const s = {
  shell:      { display: 'flex', minHeight: '100vh', background: '#f4f3ef', fontFamily: 'Segoe UI,system-ui,sans-serif' },
  sidebar:    { width: 240, flexShrink: 0, background: '#fff', borderRight: '1px solid #dddbd3', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' },
  brand:      { display: 'flex', alignItems: 'center', gap: 10, padding: '20px 18px', borderBottom: '1px solid #f0efe9' },
  brandBadge: { background: '#1a52be', color: '#fff', fontFamily: 'monospace', fontWeight: 700, fontSize: 13, width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  brandTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a18' },
  brandSub:   { fontSize: 11, color: '#999' },
  nav:        { display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 10px', flex: 1 },
  navItem:    { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#585754', textDecoration: 'none' },
  navItemActive: { background: '#eaf0ff', color: '#1a52be' },
  navIcon:    { fontSize: 15, width: 18, textAlign: 'center' },
  sidebarFooter: { borderTop: '1px solid #f0efe9', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  userRow:    { display: 'flex', alignItems: 'center', gap: 10 },
  avatar:     { background: '#f0efe9', color: '#1a52be', fontWeight: 700, fontSize: 12, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  userName:   { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userRol:    { fontSize: 11, color: '#999' },
  logoutBtn:  { background: '#f8f9fa', color: '#1a52be', border: '1px solid #1a52be', borderRadius: 6, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  main:       { flex: 1, minWidth: 0 },
};
