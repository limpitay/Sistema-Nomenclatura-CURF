import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/useAuth';
import client from '../api/client';
import Layout from '../components/Layout';

const ROL_BADGE = {
  admin:       { label: 'Admin',   bg: '#eef2fb', color: '#1a52be' },
  technician:  { label: 'Técnico', bg: '#f0efe9', color: '#585754' },
};

const emptyForm = { nombre: '', email: '', password: '', rol: 'technician', activo: true };

export default function Admin() {
  const { user } = useAuth();

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [rolFiltro,    setRolFiltro]    = useState('todos');
  const [estadoFiltro, setEstadoFiltro] = useState('todos');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null); // null = alta, objeto = edición
  const [form,      setForm]      = useState(emptyForm);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (rolFiltro !== 'todos')    params.rol = rolFiltro;
      if (estadoFiltro !== 'todos') params.estado = estadoFiltro;
      if (search) params.search = search;
      const res = await client.get('/users', { params });
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [rolFiltro, estadoFiltro, search]);

  // No incluimos 'fetchUsers' en las deps a propósito: cambia de identidad
  // con 'search', y este efecto solo debe refetchear al cambiar los
  // selectores de rol/estado (la búsqueda por texto es manual, vía Buscar).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, [rolFiltro, estadoFiltro]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchUsers();
  };

  const clearFilters = () => {
    setSearch(''); setRolFiltro('todos'); setEstadoFiltro('todos');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol, activo: u.activo });
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      if (editing) {
        const payload = { nombre: form.nombre, rol: form.rol, activo: form.activo };
        if (form.password) payload.password = form.password;
        await client.patch(`/users/${editing.id}`, payload);
      } else {
        await client.post('/users', {
          nombre: form.nombre, email: form.email, password: form.password, rol: form.rol,
        });
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const fmtDate = (d) => new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const rolBadge = (rol) => {
    const b = ROL_BADGE[rol] || ROL_BADGE.technician;
    return <span style={{ ...s.badge, background: b.bg, color: b.color }}>{b.label}</span>;
  };

  const estadoBadge = (activo) => activo
    ? <span style={{ ...s.badge, background: '#e6f5ec', color: '#1a7a3c' }}>Activo</span>
    : <span style={{ ...s.badge, background: '#fceaea', color: '#b83030' }}>Inactivo</span>;

  const editingSelf = editing?.id === user?.id;

  return (
    <Layout>
      <div style={s.body}>

        {/* ── Filtros ── */}
        <div style={s.card}>
          <div style={s.filterRow}>
            <form onSubmit={handleSearch} style={s.searchForm}>
              <input
                style={s.searchInput}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nombre o email…"
              />
              <button type="submit" style={s.btnPrimary}>Buscar</button>
            </form>

            <select style={s.select} value={rolFiltro} onChange={e => setRolFiltro(e.target.value)}>
              <option value="todos">Todos los roles</option>
              <option value="admin">Admin</option>
              <option value="technician">Técnico</option>
            </select>

            <select style={s.select} value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>

            {(search || rolFiltro !== 'todos' || estadoFiltro !== 'todos') && (
              <button style={s.btnGhost} onClick={clearFilters}>Limpiar filtros</button>
            )}
          </div>
        </div>

        {/* ── Tabla ── */}
        <div style={s.card}>
          <div style={s.tableHeader}>
            <div style={s.cardTitle}>Usuarios ({users.length})</div>
            <button style={s.btnPrimary} onClick={openCreate}>+ Agregar</button>
          </div>

          {loading ? (
            <div style={s.empty}>Cargando…</div>
          ) : users.length === 0 ? (
            <div style={s.empty}>No hay usuarios que coincidan.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Nombre', 'Email', 'Rol', 'Estado', 'Creado', ''].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={s.tr}>
                      <td style={s.td}>{u.nombre}</td>
                      <td style={{ ...s.td, color: '#666' }}>{u.email}</td>
                      <td style={s.td}>{rolBadge(u.rol)}</td>
                      <td style={s.td}>{estadoBadge(u.activo)}</td>
                      <td style={{ ...s.td, fontSize: 11, fontFamily: 'monospace', color: '#999' }}>{fmtDate(u.created_at)}</td>
                      <td style={s.td}>
                        <button style={s.btnDetail} onClick={() => openEdit(u)}>Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Modal alta / edición ── */}
      {modalOpen && (
        <div style={s.overlay} onClick={() => setModalOpen(false)}>
          <form style={s.modal} onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>

            <div style={s.modalHeader}>
              <div style={s.modalTitle}>{editing ? 'Editar usuario' : 'Nuevo usuario'}</div>
              <button type="button" style={s.modalClose} onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div style={s.field}>
              <label style={s.label}>Nombre</label>
              <input
                style={s.input}
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                required
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Email</label>
              <input
                style={{ ...s.input, ...(editing ? { background: '#f0efe9', color: '#999' } : {}) }}
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                disabled={!!editing}
                required
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
              <input
                style={s.input}
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? 'Dejar en blanco para no cambiarla' : 'Mínimo 8 caracteres'}
                required={!editing}
              />
            </div>

            <div style={s.grid2}>
              <div style={s.field}>
                <label style={s.label}>Rol</label>
                <select
                  style={s.select}
                  value={form.rol}
                  onChange={e => setForm({ ...form, rol: e.target.value })}
                  disabled={editingSelf}
                >
                  <option value="technician">Técnico</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editing && (
                <div style={s.field}>
                  <label style={s.label}>Estado</label>
                  <select
                    style={s.select}
                    value={form.activo ? 'activo' : 'inactivo'}
                    onChange={e => setForm({ ...form, activo: e.target.value === 'activo' })}
                    disabled={editingSelf}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              )}
            </div>

            {editingSelf && (
              <div style={s.hint}>No podés cambiar tu propio rol ni desactivar tu cuenta.</div>
            )}

            {formError && <div style={s.errorBox}>{formError}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="submit" style={{ ...s.btnPrimary, opacity: saving ? .6 : 1 }} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" style={s.btnGhost} onClick={() => setModalOpen(false)}>Cancelar</button>
            </div>

          </form>
        </div>
      )}

    </Layout>
  );
}

const s = {
  body:       { maxWidth: 1100, margin: '0 auto', padding: '24px 16px' },
  hint:       { fontSize: 12, color: '#8a5a00', background: '#fdf3dc', border: '1px solid #f0d090', borderRadius: 6, padding: '6px 10px' },
  card:       { background: '#fff', border: '1px solid #dddbd3', borderRadius: 10, padding: 20, marginBottom: 14 },
  filterRow:  { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  searchForm: { display: 'flex', gap: 8, flex: 1, minWidth: 220 },
  searchInput:{ flex: 1, border: '1px solid #c8c6bc', borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none', background: '#fff', color: '#1a1a18' },
  select:     { border: '1px solid #c8c6bc', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', color: '#1a1a18' },
  tableHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardTitle:  { fontSize: 14, fontWeight: 700 },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: .5, padding: '8px 10px', borderBottom: '2px solid #dddbd3', background: '#f4f3ef', whiteSpace: 'nowrap' },
  tr:         { borderBottom: '1px solid #f0efe9' },
  td:         { padding: '10px', verticalAlign: 'middle' },
  badge:      { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 },
  btnDetail:  { fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid #c8c6bc', background: '#fff', color: '#585754' },
  btnPrimary: { background: '#1a52be', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnGhost:   { background: '#f8f9fa', color: '#1a52be', border: '1px solid #1a52be', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  errorBox:   { background: '#fceaea', color: '#b83030', padding: 10, borderRadius: 6, marginTop: 10, fontSize: 13 },
  empty:      { textAlign: 'center', padding: '40px 20px', color: '#999', fontSize: 13 },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:      { background: '#fff', borderRadius: 12, border: '1px solid #dddbd3', padding: 24, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 },
  modalHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: 700 },
  modalClose: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' },
  field:      { display: 'flex', flexDirection: 'column', gap: 4 },
  label:      { fontSize: 11, fontWeight: 700, color: '#585754' },
  input:      { border: '1px solid #c8c6bc', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', color: '#1a1a18' },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
};
