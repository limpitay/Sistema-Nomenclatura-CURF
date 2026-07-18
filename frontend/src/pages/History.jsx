import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

// Los 6 estados reales de nomenclature_states, con su clave en español
// (la misma que espera el backend en ESTADO_TO_STATE) y su nombre en inglés (DB)
const ESTADOS_ALL = [
  { key: 'generado',   db: 'generated',      label: 'Generado',   bg:'#eef2fb', color:'#1a52be' },
  { key: 'reasignado', db: 'reassigned',     label: 'Reasignado', bg:'#e3f1fb', color:'#1a6ba8' },
  { key: 'baja',       db: 'decommissioned', label: 'Baja',       bg:'#fceaea', color:'#b83030' },
];
const ESTADOS = ['todos', ...ESTADOS_ALL.map(e => e.key)];
const STATE_BADGE = Object.fromEntries(ESTADOS_ALL.map(e => [e.db, e]));

export default function History() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [nomenclatures, setnomenclatures] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [estado,    setEstado]    = useState('todos');
  const [selected,  setSelected]  = useState(null);
  const [nextEstado, setNextEstado] = useState('');
  const [events,    setEvents]    = useState([]);
  const [loadingEv, setLoadingEv] = useState(false);

  // ── Cargar nomenclatures ───────────────────────────────────
  const fetchnomenclatures = async () => {
    setLoading(true);
    try {
      const params = {};
      if (estado !== 'todos') params.estado = estado;
      if (search) params.search = search;
      const res = await client.get('/nomenclatures', { params });
      setnomenclatures(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchnomenclatures(); }, [estado]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchnomenclatures();
  };

  // ── Abrir detalle (trae el historial de eventos por generated_code) ──
  const openDetail = async (hn) => {
    setSelected(hn);
    setNextEstado('');
    setLoadingEv(true);
    try {
      const res = await client.get(`/nomenclatures/${hn.generated_code}/events`);
      setEvents(res.data);
    } catch {
      setEvents([]);
    } finally {
      setLoadingEv(false);
    }
  };

  // ── Cambiar estado ─────────────────────────────────────
  const changeEstado = async () => {
    if (!nextEstado) return;
    const motivo = prompt('Motivo / detalle (opcional):') ?? '';
    try {
      await client.patch(`/nomenclatures/${selected.id}`, { estado: nextEstado, notas: motivo });
      setSelected(null);
      fetchnomenclatures();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al actualizar');
    }
  };

  const fmtDate = (d) => new Date(d).toLocaleString('es-AR', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });

  const estadoBadge = (stateName) => {
    const st = STATE_BADGE[stateName] || STATE_BADGE.withdrawn;
    return (
      <span style={{ background:st.bg, color:st.color,
        fontSize:11, fontWeight:700, padding:'2px 8px',
        borderRadius:10 }}>
        {st.label}
      </span>
    );
  };

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <span style={s.pill}>CURF</span>
          <span style={s.htitle}> Sistema de Nomenclatura</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.userChip}>👤 {user?.nombre}</span>
          <button style={s.btnGhost} onClick={() => navigate('/')}>Constructor</button>
          <button onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={s.body}>

        {/* ── Filtros ── */}
        <div style={s.card}>
          <div style={s.filterRow}>
            <form onSubmit={handleSearch} style={s.searchForm}>
              <input
                style={s.searchInput}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar hostname, edificio, sector…"
              />
              <button type="submit" style={s.btnPrimary}>Buscar</button>
              {search && (
                <button type="button" style={s.btnGhost}
                  onClick={() => { setSearch(''); setTimeout(fetchnomenclatures, 0); }}>
                  Limpiar
                </button>
              )}
            </form>
            <div style={s.estadoTabs}>
              {ESTADOS.map(e => (
                <button key={e} style={{...s.estadoTab, ...(estado===e ? s.estadoActive : {})}}
                  onClick={() => setEstado(e)}>
                  {e.charAt(0).toUpperCase() + e.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tabla ── */}
        <div style={s.card}>
          {loading ? (
            <div style={s.empty}>Cargando…</div>
          ) : nomenclatures.length === 0 ? (
            <div style={s.empty}>No hay registros que coincidan.</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Hostname','Tipo','Edificio / Sector','Técnico','Fecha','Estado',''].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nomenclatures.map(hn => (
                    <tr key={hn.id} style={s.tr}>
                      <td style={s.td}>
                        <span style={s.hnCell} onClick={() => openDetail(hn)}>
                          {hn.generated_code}
                        </span>
                      </td>
                      <td style={s.td}>{hn.device_type_name || '—'}</td>
                      <td style={s.td}>
                        <span style={s.mono}>{hn.building_name || '—'}</span>
                        <div style={{fontSize:11,color:'#999'}}>{hn.sector_name || '—'}</div>
                      </td>
                      <td style={{...s.td, fontSize:11, color:'#666'}}>{hn.creador_nombre || '—'}</td>
                      <td style={{...s.td, fontSize:11, fontFamily:'monospace'}}>{fmtDate(hn.created_at)}</td>
                      <td style={s.td}>{estadoBadge(hn.state_name)}</td>
                      <td style={s.td}>
                        <button style={s.btnDetail} onClick={() => openDetail(hn)}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Modal detalle ── */}
      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>

            <div style={s.modalHeader}>
              <div style={s.modalHn}>{selected.generated_code}</div>
              <button style={s.modalClose} onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Info */}
            <div style={s.infoGrid}>
              {[
                ['Tipo',      selected.device_type_name || '—'],
                ['Edificio',  selected.building_name || '—'],
                ['Sector',    selected.sector_name || '—'],
                ['N° secuencial', selected.sequential_number],
                ['Técnico',   selected.creador_nombre || '—'],
                ['Estado',    (STATE_BADGE[selected.state_name] || STATE_BADGE.withdrawn).label],
              ].map(([k, v]) => (
                <div key={k} style={s.infoItem}>
                  <div style={s.infoLabel}>{k}</div>
                  <div style={s.infoVal}>{v}</div>
                </div>
              ))}
            </div>

            {/* Acciones */}
            {selected.state_name !== 'decommissioned' && (
              <div style={{display:'flex', gap:8, margin:'12px 0', alignItems:'center'}}>
                <select
                  style={{...s.input, flex:1}}
                  value={nextEstado}
                  onChange={e => setNextEstado(e.target.value)}
                >
                  <option value="">Cambiar estado a…</option>
                  {ESTADOS_ALL.filter(e => e.db !== selected.state_name).map(e => (
                    <option key={e.key} value={e.key}>{e.label}</option>
                  ))}
                </select>
                <button
                  style={{...s.btnPrimary, opacity: nextEstado ? 1 : .5}}
                  disabled={!nextEstado}
                  onClick={changeEstado}
                >
                  Aplicar
                </button>
              </div>
            )}

            {/* Historial de eventos (nomenclature_history) */}
            <div style={s.evTitle}>Eventos</div>
            {loadingEv ? (
              <div style={{fontSize:13,color:'#999'}}>Cargando…</div>
            ) : events.length === 0 ? (
              <div style={{fontSize:13,color:'#999'}}>Sin eventos registrados.</div>
            ) : (
              <div style={s.evList}>
                {events.map(ev => (
                  <div key={ev.id} style={s.evItem}>
                    <div style={s.evDot} />
                    <div style={s.evDate}>{fmtDate(ev.created_at)}</div>
                    <div>
                      <div style={s.evAction}>{ev.accion}</div>
                      <div style={s.evDetail}>
                        {ev.detalle} {ev.tecnico_nombre && `· ${ev.tecnico_nombre}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

const s = {
  page:       { minHeight:'100vh', background:'#f4f3ef', fontFamily:'Segoe UI,system-ui,sans-serif' },
  header:     { background:'#fff', borderBottom:'1px solid #dddbd3', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  pill:       { background:'#1a52be', color:'#fff', fontFamily:'monospace', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4 },
  htitle:     { fontSize:16, fontWeight:700 },
  headerRight:{ display:'flex', alignItems:'center', gap:8 },
  userChip:   { fontSize:12, color:'#585754', background:'#f0efe9', border:'1px solid #dddbd3', padding:'4px 10px', borderRadius:20 },
  body:       { maxWidth:1100, margin:'0 auto', padding:'24px 16px' },
  card:       { background:'#fff', border:'1px solid #dddbd3', borderRadius:10, padding:20, marginBottom:14 },
  filterRow:  { display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 },
  searchForm: { display:'flex', gap:8, flex:1 },
  searchInput:{ flex:1, border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 12px', fontSize:13, outline:'none' },
  input:      { border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 10px', fontSize:13, outline:'none', fontFamily:'inherit', background:'#fff' },
  estadoTabs: { display:'flex', gap:4, flexWrap:'wrap' },
  estadoTab:  { border:'1px solid #c8c6bc', borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600, cursor:'pointer', background:'#fff', color:'#585754' },
  estadoActive:{ background:'#1a52be', color:'#fff', borderColor:'#1a52be' },
  table:      { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:         { textAlign:'left', fontSize:10, fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:.5, padding:'8px 10px', borderBottom:'2px solid #dddbd3', background:'#f4f3ef', whiteSpace:'nowrap' },
  tr:         { borderBottom:'1px solid #f0efe9' },
  td:         { padding:'10px', verticalAlign:'middle' },
  hnCell:     { fontFamily:'monospace', fontWeight:700, color:'#1a52be', cursor:'pointer', fontSize:13 },
  hnDisplay:  { fontFamily:'monospace', fontSize:10, color:'#999', marginTop:2 },
  mono:       { fontFamily:'monospace', fontSize:12 },
  btnDetail:  { fontSize:11, padding:'3px 10px', borderRadius:4, cursor:'pointer', border:'1px solid #c8c6bc', background:'#fff', color:'#585754' },
  btnPrimary: { background:'#1a52be', color:'#fff', border:'none', borderRadius:6, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' },
btnGhost:   { background:'#f8f9fa', color:'#1a52be', border:'1px solid #1a52be', borderRadius:6, padding:'8px 14px', fontSize:13, fontWeight:600, cursor:'pointer', marginRight:4 },  errorBox: { background:'#fceaea', color:'#b83030', padding:10, borderRadius:6, marginTop:10, fontSize:13 },
  empty:      { textAlign:'center', padding:'40px 20px', color:'#999', fontSize:13 },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:      { background:'#fff', borderRadius:12, border:'1px solid #dddbd3', padding:24, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto' },
  modalHeader:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 },
  modalHn:    { fontFamily:'monospace', fontSize:20, fontWeight:700, color:'#1a52be' },
  modalClose: { background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' },
  infoGrid:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, background:'#f4f3ef', borderRadius:6, padding:14, marginBottom:12 },
  infoItem:   { display:'flex', flexDirection:'column', gap:2 },
  infoLabel:  { fontSize:10, fontWeight:700, color:'#999', textTransform:'uppercase' },
  infoVal:    { fontSize:13, color:'#1a1a18' },
  evTitle:    { fontSize:11, fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:.5, margin:'16px 0 8px' },
  evList:     { display:'flex', flexDirection:'column', gap:0 },
  evItem:     { display:'flex', gap:10, padding:'8px 0', borderBottom:'1px dashed #e8e6de' },
  evDot:      { width:7, height:7, borderRadius:'50%', background:'#1a52be', marginTop:5, flexShrink:0 },
  evDate:     { fontFamily:'monospace', fontSize:10, color:'#999', minWidth:100, paddingTop:2 },
  evAction:   { fontSize:12, fontWeight:600 },
  evDetail:   { fontSize:11, color:'#666' },
};