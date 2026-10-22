import { useState, useEffect, useMemo, useCallback } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import { IconoOU, IconoEquipo } from '../components/IconosAD';

// Sección de solo lectura: equipos del AD agrupados por OU, siguiendo la
// estructura curf.net/CURF/Equipos/Edificio/Área/equipo.
// Las OUs más profundas que el área se muestran como subcarpeta dentro del área.

const SIN_AREA = ''; // equipos sueltos directamente en la OU del edificio

// OUs de primer nivel que son edificios: van arriba y resaltadas.
// El resto (PC, NB, Totems, EquiposSinCategorizar…) se agrupa en "Otras OU".
const EDIFICIOS = ['Catamarca', 'Hindu', 'Jacinto Rios', 'Jockey', 'Oncativo', 'Suipacha'];
const OTRAS = '__otras__'; // clave del grupo "Otras OU" en `abiertos`

const fmtFecha = (iso) => iso
  ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—';

const fmtHora = (iso) => new Date(iso).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const cmpTexto = (a, b) => a.localeCompare(b, 'es', { numeric: true });

// "Jacinto Rios/Auditoria Medica/Sub" -> { edificio, area, sub }
function partir(carpeta) {
  const [edificio = '', area = SIN_AREA, ...resto] = (carpeta || '').split('/');
  return { edificio, area, sub: resto.join('/') };
}

// Edificios -> áreas -> equipos. Incluye las OUs vacías para que se vean todas las áreas.
function armarArbol(ous, items) {
  const edificios = new Map();
  const nodo = (edificio, area) => {
    if (!edificios.has(edificio)) edificios.set(edificio, new Map());
    const areas = edificios.get(edificio);
    if (area != null && !areas.has(area)) areas.set(area, []);
    return areas;
  };

  for (const ou of ous) {
    const { edificio, area } = partir(ou);
    nodo(edificio, area === SIN_AREA ? null : area);
  }
  for (const e of items) {
    const { edificio, area, sub } = partir(e.carpeta);
    if (!edificio) continue; // equipos en la raíz de la base: no pertenecen a ningún edificio
    nodo(edificio, area).get(area).push({ ...e, area, sub });
  }

  return [...edificios.entries()]
    .sort(([a], [b]) => cmpTexto(a, b))
    .map(([nombre, areas]) => ({
      nombre,
      areas: [...areas.entries()]
        .sort(([a], [b]) => (a === SIN_AREA) - (b === SIN_AREA) || cmpTexto(a, b))
        .map(([area, equipos]) => ({ nombre: area, equipos })),
    }));
}

export default function AreasAD() {
  const [datos,   setDatos]   = useState(null); // { ous, items, leido_en, base }
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [abiertos, setAbiertos] = useState(() => new Set());
  const [seleccion, setSeleccion] = useState(null); // { edificio, area } (area null = todo el edificio)
  const [search, setSearch] = useState('');

  const fetchAreas = useCallback(async (refrescar = false) => {
    setLoading(true); setError('');
    try {
      const res = await client.get('/ad/areas', { params: refrescar ? { refrescar: 1 } : {} });
      setDatos(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo consultar el AD');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAreas(); }, [fetchAreas]);

  const arbol = useMemo(() => armarArbol(datos?.ous || [], datos?.items || []), [datos]);
  const edificios = arbol.filter(ed => EDIFICIOS.includes(ed.nombre));
  const otras     = arbol.filter(ed => !EDIFICIOS.includes(ed.nombre));

  const q = search.trim().toLowerCase();
  const coincide = useCallback((e) =>
    !q || e.nombre?.toLowerCase().includes(q) || e.descripcion?.toLowerCase().includes(q), [q]);

  // Con búsqueda se mira todo el árbol; sin búsqueda, lo seleccionado
  const equipos = useMemo(() => {
    const lista = arbol
      .filter(ed => q || ed.nombre === seleccion?.edificio)
      .flatMap(ed => ed.areas
        .filter(a => q || seleccion.area == null || a.nombre === seleccion.area)
        .flatMap(a => a.equipos.map(e => ({ ...e, edificio: ed.nombre })))
      )
      .filter(coincide);
    return lista.sort((a, b) => cmpTexto(a.nombre || '', b.nombre || ''));
  }, [arbol, seleccion, q, coincide]);

  // Clic en un edificio: lo abre y lo elige; si ya estaba elegido, lo pliega/despliega
  const elegir = (edificio, area = null) => {
    if (area == null) {
      const yaElegido = !q && seleccion?.edificio === edificio && seleccion.area == null;
      setAbiertos(prev => {
        const s2 = new Set(prev);
        if (yaElegido && s2.has(edificio)) s2.delete(edificio); else s2.add(edificio);
        return s2;
      });
    }
    setSeleccion({ edificio, area });
    setSearch('');
  };

  const toggleOtras = () => setAbiertos(prev => {
    const s2 = new Set(prev);
    if (s2.has(OTRAS)) s2.delete(OTRAS); else s2.add(OTRAS);
    return s2;
  });

  const totalDe = (ed) => ed.areas.reduce((n, a) => n + a.equipos.length, 0);
  const totalAreas = edificios.reduce((n, ed) => n + ed.areas.filter(a => a.nombre !== SIN_AREA).length, 0);
  const totalEquipos = arbol.reduce((n, ed) => n + totalDe(ed), 0);

  // Una OU de primer nivel con sus áreas. `nivel` = sangría (0 edificios, 1 dentro de "Otras OU")
  const renderOU = (ed, esEdificio, nivel) => {
    const abierto = abiertos.has(ed.nombre);
    const edActivo = !q && seleccion?.edificio === ed.nombre && seleccion.area == null;
    const sangria = 8 + nivel * 18;
    return (
      <div key={ed.nombre}>
        <button
          style={{ ...s.treeItem, paddingLeft: sangria, ...(esEdificio ? s.treeEdificio : {}), ...(edActivo ? s.treeItemActive : {}) }}
          onClick={() => elegir(ed.nombre)}
        >
          <span style={s.caret}>{ed.areas.some(a => a.nombre !== SIN_AREA) ? (abierto ? '▾' : '▸') : ''}</span>
          <IconoOU />
          <span style={s.treeLabel}>{ed.nombre}</span>
          <span style={{ ...s.count, ...(esEdificio ? s.countEdificio : {}) }}>{totalDe(ed)}</span>
        </button>
        {abierto && ed.areas.map(a => {
          const activo = !q && seleccion?.edificio === ed.nombre && seleccion.area === a.nombre;
          return (
            <button
              key={a.nombre}
              style={{ ...s.treeItem, paddingLeft: sangria + 30, ...(activo ? s.treeItemActive : {}) }}
              onClick={() => elegir(ed.nombre, a.nombre)}
            >
              <IconoOU />
              <span style={{ ...s.treeLabel, ...(a.nombre === SIN_AREA ? { fontStyle: 'italic', color: '#999' } : {}) }}>
                {a.nombre || '(sin área)'}
              </span>
              <span style={{ ...s.count, ...(a.equipos.length ? {} : { opacity: .5 }) }}>{a.equipos.length}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const titulo = q
    ? `Resultados de "${search.trim()}"`
    : seleccion
      ? seleccion.area == null
        ? seleccion.edificio
        : `${seleccion.edificio} / ${seleccion.area || '(sin área)'}`
      : null;

  return (
    <Layout>
      <div style={s.body}>

        {/* ── Encabezado ── */}
        <div style={s.header}>
          <div>
            <div style={s.title}>Áreas AD</div>
            <div style={s.sub}>
              Solo lectura · Edificio / Área / Equipo
              {datos?.base ? <> · <span style={{ fontFamily: 'monospace' }}>{datos.base}</span></> : null}
            </div>
          </div>
          <div style={s.headerRight}>
            {datos && (
              <span style={s.meta}>
                Leído del AD {fmtHora(datos.leido_en)} · {edificios.length} edificios · {totalAreas} áreas · {totalEquipos} equipos
              </span>
            )}
            <button style={{ ...s.btnPrimary, opacity: loading ? .6 : 1 }} disabled={loading} onClick={() => fetchAreas(true)}>
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
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar un equipo en todas las áreas (nombre o descripción)…"
            />
            {search && <button style={s.btnGhost} onClick={() => setSearch('')}>Limpiar</button>}
          </div>
        </div>

        <div style={s.columns}>

          {/* ── Árbol de OUs ── */}
          <div style={{ ...s.card, ...s.treeCard }}>
            <div style={{ ...s.cardTitle, marginBottom: 10 }}>Edificios y áreas</div>
            {loading && !datos ? (
              <div style={s.empty}>Leyendo el AD…</div>
            ) : arbol.length === 0 ? (
              <div style={s.empty}>{datos ? 'No hay OUs debajo de la base.' : '—'}</div>
            ) : (
              <>
                {edificios.length > 0 && (
                  <div style={s.grupoEdificios}>
                    <div style={s.grupoTitulo}>Edificios</div>
                    {edificios.map(ed => renderOU(ed, true, 0))}
                  </div>
                )}
                {otras.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <button style={{ ...s.treeItem, fontWeight: 600, color: '#585754' }} onClick={toggleOtras}>
                      <span style={s.caret}>{abiertos.has(OTRAS) ? '▾' : '▸'}</span>
                      <IconoOU />
                      <span style={s.treeLabel}>Otras OU</span>
                      <span style={s.count}>{otras.reduce((n, ed) => n + totalDe(ed), 0)}</span>
                    </button>
                    {abiertos.has(OTRAS) && otras.map(ed => renderOU(ed, false, 1))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Equipos del área ── */}
          <div style={{ ...s.card, flex: 1, minWidth: 0 }}>
            {!titulo ? (
              <div style={s.empty}>Elegí un edificio o un área para ver sus equipos.</div>
            ) : (
              <>
                <div style={{ ...s.cardTitle, marginBottom: 14 }}>{titulo} ({equipos.length})</div>
                {equipos.length === 0 ? (
                  <div style={s.empty}>{q ? 'No hay equipos que coincidan.' : 'Esta OU no tiene equipos.'}</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Nombre</th>
                          {(q || seleccion?.area == null) && <th style={s.th}>Ubicación</th>}
                          <th style={s.th}>Sistema operativo</th>
                          <th style={s.th}>Último login</th>
                          <th style={s.th}>Descripción</th>
                          <th style={s.th}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipos.map(e => (
                          <tr key={e.nombre + e.carpeta} style={{ ...s.tr, ...(e.habilitado ? {} : { color: '#999' }) }}>
                            <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 600 }}>
                              <div style={s.conIcono}>
                                <IconoEquipo deshabilitado={!e.habilitado} />
                                <div>
                                  {e.nombre}
                                  {e.sub && <div style={s.subcarpeta}>{e.sub}</div>}
                                </div>
                              </div>
                            </td>
                            {(q || seleccion?.area == null) && (
                              <td style={s.td}>
                                <div style={s.conIcono}>
                                  <IconoOU size={14} />
                                  <span>{q && <>{e.edificio} / </>}{e.area || <i style={{ color: '#999' }}>(sin área)</i>}</span>
                                </div>
                              </td>
                            )}
                            <td style={s.td}>{e.so || '—'}</td>
                            <td style={{ ...s.td, ...s.mono }}>{fmtFecha(e.ultimo_login)}</td>
                            <td style={{ ...s.td, color: '#666' }}>{e.descripcion || '—'}</td>
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
              </>
            )}
          </div>

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
  columns:    { display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
  card:       { background: '#fff', border: '1px solid #dddbd3', borderRadius: 10, padding: 20, marginBottom: 14 },
  treeCard:   { width: 300, flexShrink: 0, padding: 12, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' },
  cardTitle:  { fontSize: 14, fontWeight: 700 },
  treeItem:   { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#1a1a18', textAlign: 'left' },
  treeItemActive: { background: '#eaf0ff', color: '#1a52be', fontWeight: 600 },
  treeEdificio:   { fontWeight: 700 },
  grupoEdificios: { background: '#f5f8ff', border: '1px solid #d6e2fb', borderRadius: 8, padding: 6 },
  grupoTitulo:    { fontSize: 10, fontWeight: 700, color: '#1a52be', textTransform: 'uppercase', letterSpacing: .5, padding: '4px 8px 6px' },
  countEdificio:  { background: '#dbe6fd', color: '#1a52be' },
  caret:      { width: 12, fontSize: 11, color: '#999', flexShrink: 0 },
  conIcono:   { display: 'flex', alignItems: 'flex-start', gap: 7 },
  treeLabel:  { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  count:      { fontSize: 11, fontWeight: 700, color: '#585754', background: '#f0efe9', borderRadius: 10, padding: '1px 7px', flexShrink: 0 },
  subcarpeta: { fontSize: 11, fontWeight: 400, color: '#999', fontFamily: 'Segoe UI,system-ui,sans-serif' },
  filterRow:  { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  searchInput:{ flex: 1, minWidth: 220, border: '1px solid #c8c6bc', borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none', background: '#fff', color: '#1a1a18' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: .5, padding: '8px 10px', borderBottom: '2px solid #dddbd3', background: '#f4f3ef', whiteSpace: 'nowrap' },
  tr:         { borderBottom: '1px solid #f0efe9' },
  td:         { padding: '8px 10px', verticalAlign: 'middle' },
  mono:       { fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' },
  badge:      { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' },
  btnPrimary: { background: '#1a52be', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnGhost:   { background: '#f8f9fa', color: '#1a52be', border: '1px solid #1a52be', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  errorBox:   { background: '#fceaea', color: '#b83030', border: '1px solid #f0b0b0', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 13 },
  empty:      { textAlign: 'center', padding: '40px 20px', color: '#999', fontSize: 13 },
};
