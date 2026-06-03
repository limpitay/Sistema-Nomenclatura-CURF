import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const EDIFICIOS = [
  { code:'JR', name:'Jacinto Ríos' },
  { code:'ON', name:'Oncativo'     },
  { code:'AU', name:'Audiología'   },
  { code:'SU', name:'Suipacha'     },
  { code:'JK', name:'Jockey'       },
];

const TIPOS = [
  { code:'PC',  name:'Desktop',    icon:'🖥'  },
  { code:'NB',  name:'Notebook',   icon:'💻'  },
  { code:'IMP', name:'Impresora',  icon:'🖨'  },
  { code:'CAM', name:'Cámara IP',  icon:'📷'  },
  { code:'CEL', name:'Celular',    icon:'📱'  },
  { code:'TT',  name:'Tótem',      icon:'🖲'  },
  { code:'LL',  name:'Llamador',   icon:'🔔'  },
  { code:'FID', name:'Face ID',    icon:'🪪'  },
  { code:'REL', name:'Reloj',      icon:'🕐'  },
];

const SECTORES = [
  'ADM','ASC','COM','DIR','ENF','FAC','FAR',
  'FIN','INF','LAB','LIM','MAN','MED',
  'REC','RRH','RX','SEC','SIS','UTI',
];

const PISOS = ['SS','PB','P1','P2','P3','P4'];

export default function Builder() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [edif,    setEdif]    = useState('');
  const [tipo,    setTipo]    = useState('');
  const [piso,    setPiso]    = useState('');
  const [sector,  setSector]  = useState('');
  const [nextNum, setNextNum] = useState('');
  const [usuario, setUsuario] = useState('');
  const [serie,   setSerie]   = useState('');
  const [notas,   setNotas]   = useState('');

  const [hostname,  setHostname]  = useState('');
  const [display,   setDisplay]   = useState('');
  const [lockTimer, setLockTimer] = useState(0);
  const [locked,    setLocked]    = useState(false);
  const [lockMsg,   setLockMsg]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(null);
  const [error,     setError]     = useState('');

  // ── Calcular hostname ──────────────────────────────────
  useEffect(() => {
    if (!edif || !tipo || !piso || !sector || !nextNum) {
      setHostname(''); setDisplay(''); return;
    }
    const num  = String(nextNum).padStart(2, '0');
    setDisplay(`${edif}-${piso}-${sector}-${tipo}${num}`);
    setHostname(`${edif}${piso}${sector}${tipo}${num}`);
  }, [edif, tipo, piso, sector, nextNum]);

  // ── Traer próximo número ───────────────────────────────
  useEffect(() => {
    if (!edif || !tipo || !piso || !sector) { setNextNum(''); return; }
    client.get('/hostnames/next', { params: { tipo, edificio: edif, piso, sector } })
      .then(res => setNextNum(res.data.next))
      .catch(()  => setNextNum('01'));
  }, [edif, tipo, piso, sector]);

  // ── Countdown del lock ─────────────────────────────────
  useEffect(() => {
    if (!locked || lockTimer <= 0) return;
    const t = setTimeout(() => setLockTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [locked, lockTimer]);

  useEffect(() => {
    if (locked && lockTimer === 0) {
      setLocked(false);
      setLockMsg('⏱ Reserva expirada. Volvé a reservar antes de guardar.');
    }
  }, [locked, lockTimer]);

  // ── Reservar hostname ──────────────────────────────────
  const handleLock = async () => {
    if (!hostname) return;
    setLockMsg(''); setError('');
    try {
      const res = await client.post('/hostnames/lock', { hostname });
      setLocked(true);
      setLockTimer(res.data.expires_in);
      setLockMsg('');
    } catch (err) {
      const d = err.response?.data;
      if (d?.locked_by) {
        const m = Math.ceil(d.expires_in / 60);
        setLockMsg(`🔒 Reservado por ${d.locked_by} — expira en ${m} min`);
      } else {
        setLockMsg(d?.error || 'Error al reservar');
      }
    }
  };

  // ── Guardar ────────────────────────────────────────────
  const handleSave = async () => {
    if (!locked)   { setError('Reservá el hostname antes de guardar.'); return; }
    if (!usuario)  { setError('El usuario Windows es obligatorio.');    return; }
    setSaving(true); setError('');
    try {
      const res = await client.post('/hostnames', {
        hostname, hostname_display: display,
        tipo, edificio: edif, piso, sector,
        usuario_windows: usuario,
        numero_serie: serie || null,
        notas: notas || null,
      });
      setSaved(res.data);
      setLocked(false); setLockTimer(0);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ── Limpiar ────────────────────────────────────────────
  const handleClear = () => {
    setEdif(''); setTipo(''); setPiso(''); setSector('');
    setUsuario(''); setSerie(''); setNotas('');
    setLocked(false); setLockTimer(0);
    setLockMsg(''); setError(''); setSaved(null);
  };

  const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

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
          <button style={s.btnGhost} onClick={() => navigate('/historial')}>Historial</button>
          <button style={s.btnGhost} onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={s.body}>

        {/* ── Resultado guardado ── */}
        {saved && (
          <div style={s.savedBox}>
            <div style={s.savedTitle}>✅ Hostname registrado</div>
            <div style={s.savedHn}>{saved.hostname}</div>
            <div style={s.savedSub}>{saved.hostname_display} · {saved.tipo} · {saved.edificio} {saved.piso} {saved.sector}</div>
            <button style={{...s.btnPrimary, marginTop:12}} onClick={handleClear}>
              Crear otro
            </button>
          </div>
        )}

        {!saved && <>

        {/* ── Edificio ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>Edificio</div>
          <div style={s.grid5}>
            {EDIFICIOS.map(e => (
              <div key={e.code}
                style={{...s.selBtn, ...(edif===e.code ? s.selActive : {})}}
                onClick={() => setEdif(e.code)}>
                <div style={s.selCode}>{e.code}</div>
                <div style={s.selName}>{e.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tipo ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>Tipo de dispositivo</div>
          <div style={s.grid5}>
            {TIPOS.map(t => (
              <div key={t.code}
                style={{...s.selBtn, ...(tipo===t.code ? s.selActive : {})}}
                onClick={() => setTipo(t.code)}>
                <div style={{fontSize:20}}>{t.icon}</div>
                <div style={s.selCode}>{t.code}</div>
                <div style={s.selName}>{t.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Piso / Sector / Número ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>Ubicación</div>
          <div style={s.grid3}>
            <div style={s.field}>
              <label style={s.label}>Piso</label>
              <select style={s.select} value={piso} onChange={e => setPiso(e.target.value)}>
                <option value="">-- Seleccionar --</option>
                {PISOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Sector</label>
              <select style={s.select} value={sector} onChange={e => setSector(e.target.value)}>
                <option value="">-- Seleccionar --</option>
                {SECTORES.map(sec => <option key={sec} value={sec}>{sec}</option>)}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Número (auto)</label>
              <input style={{...s.select, background:'#f0efe9', color:'#888'}}
                value={nextNum} readOnly />
            </div>
          </div>
        </div>

        {/* ── Preview ── */}
        {hostname && (
          <div style={s.card}>
            <div style={s.cardTitle}>Hostname generado</div>
            <div style={s.previewBox}>
              <div>
                <div style={s.previewLabel}>Visual</div>
                <div style={s.previewDisplay}>{display}</div>
              </div>
              <div>
                <div style={s.previewLabel}>Hostname AD</div>
                <div style={s.previewFinal}>{hostname}</div>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end'}}>
                {!locked
                  ? <button style={s.btnLock} onClick={handleLock}>🔒 Reservar (3 min)</button>
                  : <div style={s.timerChip}>⏱ {fmtTime(lockTimer)} reservado</div>
                }
                {lockMsg && <div style={s.lockWarn}>{lockMsg}</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Datos del equipo ── */}
        <div style={s.card}>
          <div style={s.cardTitle}>Datos del equipo</div>
          <div style={s.grid2}>
            <div style={s.field}>
              <label style={s.label}>Usuario Windows *</label>
              <input style={s.input} value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="usuario.apellido" />
            </div>
            <div style={s.field}>
              <label style={s.label}>Número de serie</label>
              <input style={s.input} value={serie}
                onChange={e => setSerie(e.target.value)}
                placeholder="Opcional" />
            </div>
            <div style={{...s.field, gridColumn:'1/-1'}}>
              <label style={s.label}>Técnico asignante</label>
              <input style={{...s.input, background:'#f0efe9', color:'#888'}}
                value={`${user?.nombre} <${user?.email}>`} readOnly />
            </div>
            <div style={{...s.field, gridColumn:'1/-1'}}>
              <label style={s.label}>Notas</label>
              <textarea style={{...s.input, minHeight:60, resize:'vertical'}}
                value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones opcionales" />
            </div>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <div style={{display:'flex', gap:8, marginTop:16}}>
            <button style={{...s.btnPrimary, opacity: locked ? 1 : .5}}
              onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar hostname'}
            </button>
            <button style={s.btnGhost} onClick={handleClear}>Limpiar</button>
          </div>
        </div>

        </>}
      </div>
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
  body:       { maxWidth:860, margin:'0 auto', padding:'24px 16px' },
  card:       { background:'#fff', border:'1px solid #dddbd3', borderRadius:10, padding:20, marginBottom:14 },
  cardTitle:  { fontSize:11, fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:.6, marginBottom:12 },
  grid5:      { display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 },
  grid3:      { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
  grid2:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  selBtn:     { border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 4px', textAlign:'center', cursor:'pointer', transition:'all .15s', background:'#fff' },
  selActive:  { borderColor:'#1a52be', background:'#eaf0ff' },
  selCode:    { fontFamily:'monospace', fontSize:13, fontWeight:700, color:'#1a52be' },
  selName:    { fontSize:10, color:'#999', marginTop:2 },
  field:      { display:'flex', flexDirection:'column', gap:4 },
  label:      { fontSize:11, fontWeight:700, color:'#585754', textTransform:'uppercase', letterSpacing:.4 },
  select:     { border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 10px', fontSize:13, outline:'none' },
  input:      { border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 10px', fontSize:13, outline:'none', fontFamily:'inherit' },
  previewBox: { display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, background:'#f4f3ef', border:'1px solid #dddbd3', borderRadius:6, padding:'14px 16px' },
  previewLabel:  { fontSize:10, fontWeight:700, color:'#999', textTransform:'uppercase', marginBottom:4 },
  previewDisplay:{ fontFamily:'monospace', fontSize:18, color:'#444' },
  previewFinal:  { fontFamily:'monospace', fontSize:22, fontWeight:700, color:'#1a52be' },
  btnLock:    { background:'#fff', border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer' },
  timerChip:  { background:'#e6f5ec', color:'#1a7a3c', border:'1px solid #9adfc8', borderRadius:20, padding:'6px 14px', fontSize:13, fontWeight:700 },
  lockWarn:   { fontSize:11, color:'#8a5a00', background:'#fdf3dc', border:'1px solid #f0d090', borderRadius:4, padding:'4px 8px' },
  btnPrimary: { background:'#1a52be', color:'#fff', border:'none', borderRadius:6, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnGhost:   { background:'transparent', color:'#585754', border:'1px solid #c8c6bc', borderRadius:6, padding:'9px 14px', fontSize:13, cursor:'pointer' },
  errorBox:   { background:'#fceaea', color:'#b83030', border:'1px solid #f0b0b0', borderRadius:6, padding:'8px 12px', fontSize:12, marginTop:10 },
  savedBox:   { background:'#fff', border:'1px solid #9adfc8', borderRadius:10, padding:28, textAlign:'center', marginBottom:14 },
  savedTitle: { fontSize:14, fontWeight:600, color:'#1a7a3c', marginBottom:10 },
  savedHn:    { fontFamily:'monospace', fontSize:28, fontWeight:700, color:'#1a52be' },
  savedSub:   { fontSize:13, color:'#888', marginTop:4 },
};