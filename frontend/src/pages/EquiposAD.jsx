import { useState, useEffect, useMemo, useCallback } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';

// Sección de solo lectura: equipos del AD (LDAP_EQUIPOS_BASE) cruzados con las
// nomenclaturas del sistema. Los filtros y el orden son del lado del cliente.

const COLUMNAS = [
  { key: 'nombre',       label: 'Nombre' },
  { key: 'carpeta',      label: 'Carpeta' },
  { key: 'so',           label: 'Sistema operativo' },
  { key: 'ultimo_login', label: 'Último login' },
  { key: 'descripcion',  label: 'Descripción' },
  { key: 'creado',       label: 'Creado' },
  { key: 'habilitado',   label: 'Estado' },
  { key: 'en_nomenclatura', label: 'Nomenclatura' },
];

const fmtFecha = (iso) => iso
  ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—';

const fmtHora = (iso) => new Date(iso).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

export default function EquiposAD() {
  const [datos,   setDatos]   = useState(null); // { items, leido_en, base }
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [search,   setSearch]   = useState('');
  const [carpeta,  setCarpeta]  = useState('todas');
  const [estado,   setEstado]   = useState('todos');
  const [nomencl,  setNomencl]  = useState('todos');
  const [orden,    setOrden]    = useState({ key: 'nombre', asc: true });

  const fetchEquipos = useCallback(async (refrescar = false) => {
    setLoading(true); setError('');
    try {
      const res = await client.get('/ad/equipos', { params: refrescar ? { refrescar: 1 } : {} });
      setDatos(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo consultar el AD');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchEquipos(); }, [fetchEquipos]);

  const items = useMemo(() => datos?.items || [], [datos]);

  // Carpetas con su cantidad, para el desplegable
  const carpetas = useMemo(() => {
    const cuenta = new Map();
    for (const e of items) cuenta.set(e.carpeta, (cuenta.get(e.carpeta) || 0) + 1);
    return [...cuenta].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    const lista = items.filter(e =>
      (!q || e.nombre?.toLowerCase().includes(q) || e.descripcion?.toLowerCase().includes(q)) &&
      (carpeta === 'todas' || e.carpeta === carpeta) &&
      (estado === 'todos' || (estado === 'habilitados') === e.habilitado) &&
      (nomencl === 'todos' || (nomencl === 'con') === e.en_nomenclatura)
    );
    const { key, asc } = orden;
    return lista.sort((a, b) => {
      const va = a[key] ?? '', vb = b[key] ?? '';
      const cmp = typeof va === 'boolean' ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), 'es', { numeric: true });
      return asc ? cmp : -cmp;
    });
  }, [items, search, carpeta, estado, nomencl, orden]);

  const ordenarPor = (key) => setOrden(o => ({ key, asc: o.key === key ? !o.asc : true }));

  const hayFiltros = search || carpeta !== 'todas' || estado !== 'todos' || nomencl !== 'todos';
  const clearFilters = () => { setSearch(''); setCarpeta('todas'); setEstado('todos'); setNomencl('todos'); };

  const deshabilitados = items.filter(e => !e.habilitado).length;
  const sinNomenclatura = items.filter(e => !e.en_nomenclatura).length;

  return (
    <Layout>
      <div style={s.body}>

        {/* ── Encabezado ── */}
        <div style={s.header}>
          <div>
            <div style={s.title}>Equipos AD</div>
            <div style={s.sub}>
              Solo lectura{datos?.base ? <> · <span style={{ fontFamily: 'monospace' }}>{datos.base}</span></> : null}
            </div>
          </div>
          <div style={s.headerRight}>
            {datos && (
              <span style={s.meta}>
                Leído del AD {fmtHora(datos.leido_en)} · {items.length} equipos
                {deshabilitados > 0 && ` (${deshabilitados} deshabilitados)`} · {sinNomenclatura} sin nomenclatura
              </span>
            )}
            <button style={{ ...s.btnPrimary, opacity: loading ? .6 : 1 }} disabled={loading} onClick={() => fetchEquipos(true)}>
              {loading ? 'Leyendo…' : 'Actualizar'}
            </button>
          </div>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {/* ── Filtros ── */}
        <div style={s.card}>
          <div style={s.filterRow}>
            <input
              style={s.searchInput}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o descripción…"
            />

            <select style={s.select} value={carpeta} onChange={e => setCarpeta(e.target.value)}>
              <option value="todas">Todas las carpetas ({items.length})</option>
              {carpetas.map(([c, n]) => (
                <option key={c} value={c}>{c || '(raíz)'} ({n})</option>
              ))}
            </select>

            <select style={s.select} value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="todos">Habilitados y deshabilitados</option>
              <option value="habilitados">Solo habilitados</option>
              <option value="deshabilitados">Solo deshabilitados</option>
            </select>

            <select style={s.select} value={nomencl} onChange={e => setNomencl(e.target.value)}>
              <option value="todos">Con y sin nomenclatura</option>
              <option value="con">Con nomenclatura</option>
              <option value="sin">Sin nomenclatura</option>
            </select>

            {hayFiltros && <button style={s.btnGhost} onClick={clearFilters}>Limpiar filtros</button>}
          </div>
        </div>

        {/* ── Tabla ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>Equipos ({filtrados.length})</div>

          {loading && !datos ? (
            <div style={s.empty}>Leyendo el AD…</div>
          ) : filtrados.length === 0 ? (
            <div style={s.empty}>{datos ? 'No hay equipos que coincidan.' : '—'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {COLUMNAS.map(c => (
                      <th key={c.key} style={s.th} onClick={() => ordenarPor(c.key)}>
                        {c.label}{orden.key === c.key ? (orden.asc ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(e => (
                    <tr key={e.nombre + e.carpeta} style={{ ...s.tr, ...(e.habilitado ? {} : { color: '#999' }) }}>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 600 }}>{e.nombre}</td>
                      <td style={s.td}>{e.carpeta || '(raíz)'}</td>
                      <td style={s.td}>{e.so || '—'}</td>
                      <td style={{ ...s.td, ...s.mono }}>{fmtFecha(e.ultimo_login)}</td>
                      <td style={{ ...s.td, color: '#666' }}>{e.descripcion || '—'}</td>
                      <td style={{ ...s.td, ...s.mono }}>{fmtFecha(e.creado)}</td>
                      <td style={s.td}>
                        {e.habilitado
                          ? <span style={{ ...s.badge, background: '#e6f5ec', color: '#1a7a3c' }}>Habilitado</span>
                          : <span style={{ ...s.badge, background: '#fceaea', color: '#b83030' }}>Deshabilitado</span>}
                      </td>
                      <td style={s.td}>
                        {e.en_nomenclatura
                          ? <span style={{ ...s.badge, background: '#eef2fb', color: '#1a52be' }}>Registrado</span>
                          : <span style={{ ...s.badge, background: '#fdf3dc', color: '#8a5a00' }}>Sin registrar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}

const s = {
  body:       { maxWidth: 1300, margin: '0 auto', padding: '24px 16px' },
  header:     { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  title:      { fontSize: 18, fontWeight: 700, color: '#1a1a18' },
  sub:        { fontSize: 12, color: '#999', marginTop: 2 },
  headerRight:{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  meta:       { fontSize: 12, color: '#777' },
  card:       { background: '#fff', border: '1px solid #dddbd3', borderRadius: 10, padding: 20, marginBottom: 14 },
  cardTitle:  { fontSize: 14, fontWeight: 700, marginBottom: 14 },
  filterRow:  { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  searchInput:{ flex: 1, minWidth: 220, border: '1px solid #c8c6bc', borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none', background: '#fff', color: '#1a1a18' },
  select:     { border: '1px solid #c8c6bc', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', color: '#1a1a18' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: .5, padding: '8px 10px', borderBottom: '2px solid #dddbd3', background: '#f4f3ef', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' },
  tr:         { borderBottom: '1px solid #f0efe9' },
  td:         { padding: '8px 10px', verticalAlign: 'middle' },
  mono:       { fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' },
  badge:      { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' },
  btnPrimary: { background: '#1a52be', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnGhost:   { background: '#f8f9fa', color: '#1a52be', border: '1px solid #1a52be', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  errorBox:   { background: '#fceaea', color: '#b83030', border: '1px solid #f0b0b0', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 13 },
  empty:      { textAlign: 'center', padding: '40px 20px', color: '#999', fontSize: 13 },
};
