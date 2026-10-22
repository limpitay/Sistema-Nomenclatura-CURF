import { useState, useEffect, useMemo, useCallback } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import { IconoOU, IconoEquipo } from '../components/IconosAD';

// Sección de solo lectura: equipos del AD (LDAP_EQUIPOS_BASE).
// Búsqueda, orden y paginado son del lado del cliente.

const COLUMNAS = [
  { key: 'nombre',       label: 'Nombre' },
  { key: 'carpeta',      label: 'Carpeta' },
  { key: 'so',           label: 'Sistema operativo' },
  { key: 'ultimo_login', label: 'Último login' },
  { key: 'descripcion',  label: 'Descripción' },
  { key: 'creado',       label: 'Creado' },
  { key: 'habilitado',   label: 'Estado' },
];

const TAMANIOS_PAGINA = [25, 50];

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
  const [orden,    setOrden]    = useState({ key: 'nombre', asc: true });
  const [pagina,   setPagina]   = useState(1);
  const [porPagina, setPorPagina] = useState(25);

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

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    const lista = items.filter(e =>
      !q || e.nombre?.toLowerCase().includes(q) || e.descripcion?.toLowerCase().includes(q)
    );
    const { key, asc } = orden;
    return lista.sort((a, b) => {
      const va = a[key] ?? '', vb = b[key] ?? '';
      const cmp = typeof va === 'boolean' ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), 'es', { numeric: true });
      return asc ? cmp : -cmp;
    });
  }, [items, search, orden]);

  // Cambiar búsqueda, orden o tamaño de página vuelve a la página 1
  const ordenarPor = (key) => { setOrden(o => ({ key, asc: o.key === key ? !o.asc : true })); setPagina(1); };
  const buscar = (valor) => { setSearch(valor); setPagina(1); };
  const cambiarPorPagina = (n) => { setPorPagina(n); setPagina(1); };

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaActual = Math.min(pagina, totalPaginas);
  const desde = (paginaActual - 1) * porPagina;
  const visibles = filtrados.slice(desde, desde + porPagina);

  const deshabilitados = items.filter(e => !e.habilitado).length;

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
                {deshabilitados > 0 && ` (${deshabilitados} deshabilitados)`}
                {' · '}{datos.nomenclaturas_creadas} nomenclaturas creadas en el sistema
              </span>
            )}
            <button style={{ ...s.btnPrimary, opacity: loading ? .6 : 1 }} disabled={loading} onClick={() => fetchEquipos(true)}>
              {loading ? 'Leyendo…' : 'Actualizar'}
            </button>
          </div>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {/* ── Búsqueda ── */}
        <div style={s.card}>
          <div style={s.filterRow}>
            <input
              style={s.searchInput}
              value={search}
              onChange={e => buscar(e.target.value)}
              placeholder="Buscar por nombre o descripción…"
            />
            {search && <button style={s.btnGhost} onClick={() => buscar('')}>Limpiar</button>}
          </div>
        </div>

        {/* ── Tabla ── */}
        <div style={s.card}>
          <div style={s.tableHeader}>
            <div style={s.cardTitle}>Equipos ({filtrados.length})</div>
            <label style={s.pageSizeLabel}>
              Mostrar
              <select style={s.select} value={porPagina} onChange={e => cambiarPorPagina(Number(e.target.value))}>
                {TAMANIOS_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              por página
            </label>
          </div>

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
                  {visibles.map(e => (
                    <tr key={e.nombre + e.carpeta} style={{ ...s.tr, ...(e.habilitado ? {} : { color: '#999' }) }}>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 600 }}>
                        <span style={s.conIcono}><IconoEquipo deshabilitado={!e.habilitado} />{e.nombre}</span>
                      </td>
                      <td style={s.td}>
                        <span style={s.conIcono}><IconoOU size={14} />{e.carpeta || '(raíz)'}</span>
                      </td>
                      <td style={s.td}>{e.so || '—'}</td>
                      <td style={{ ...s.td, ...s.mono }}>{fmtFecha(e.ultimo_login)}</td>
                      <td style={{ ...s.td, color: '#666' }}>{e.descripcion || '—'}</td>
                      <td style={{ ...s.td, ...s.mono }}>{fmtFecha(e.creado)}</td>
                      <td style={s.td}>
                        {e.habilitado
                          ? <span style={{ ...s.badge, background: '#e6f5ec', color: '#1a7a3c' }}>Habilitado</span>
                          : <span style={{ ...s.badge, background: '#fceaea', color: '#b83030' }}>Deshabilitado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtrados.length > 0 && (
            <div style={s.pager}>
              <span style={s.meta}>
                Mostrando {desde + 1}–{Math.min(desde + porPagina, filtrados.length)} de {filtrados.length}
              </span>
              <div style={s.pagerBtns}>
                <button style={s.btnPage} disabled={paginaActual === 1} onClick={() => setPagina(1)}>«</button>
                <button style={s.btnPage} disabled={paginaActual === 1} onClick={() => setPagina(paginaActual - 1)}>‹ Anterior</button>
                <span style={s.pageInfo}>Página {paginaActual} de {totalPaginas}</span>
                <button style={s.btnPage} disabled={paginaActual === totalPaginas} onClick={() => setPagina(paginaActual + 1)}>Siguiente ›</button>
                <button style={s.btnPage} disabled={paginaActual === totalPaginas} onClick={() => setPagina(totalPaginas)}>»</button>
              </div>
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
  cardTitle:  { fontSize: 14, fontWeight: 700 },
  tableHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  pageSizeLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#585754' },
  pager:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 },
  pagerBtns:  { display: 'flex', alignItems: 'center', gap: 6 },
  pageInfo:   { fontSize: 13, color: '#585754', padding: '0 6px' },
  btnPage:    { fontSize: 12, padding: '5px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid #c8c6bc', background: '#fff', color: '#585754' },
  filterRow:  { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  searchInput:{ flex: 1, minWidth: 220, border: '1px solid #c8c6bc', borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none', background: '#fff', color: '#1a1a18' },
  select:     { border: '1px solid #c8c6bc', borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', color: '#1a1a18' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: .5, padding: '8px 10px', borderBottom: '2px solid #dddbd3', background: '#f4f3ef', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' },
  tr:         { borderBottom: '1px solid #f0efe9' },
  td:         { padding: '8px 10px', verticalAlign: 'middle' },
  mono:       { fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' },
  conIcono:   { display: 'inline-flex', alignItems: 'center', gap: 7 },
  badge:      { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' },
  btnPrimary: { background: '#1a52be', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnGhost:   { background: '#f8f9fa', color: '#1a52be', border: '1px solid #1a52be', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  errorBox:   { background: '#fceaea', color: '#b83030', border: '1px solid #f0b0b0', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 13 },
  empty:      { textAlign: 'center', padding: '40px 20px', color: '#999', fontSize: 13 },
};
