import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

// Solo estos tipos de dispositivo requieren cargar Usuario Windows
const TIPOS_CON_USUARIO = ['PC', 'TT', 'LL', 'NB'];

// Estos tipos arman el hostname como Tipo-Edificio-Piso-Número (sin Sector en el código,
// aunque el campo Sector se sigue pidiendo en el formulario para reportes internos)
const TIPOS_SIN_SECTOR_EN_CODIGO = ['TT', 'LL', 'CAM', 'FID'];

// Cuando el Sector elegido es Consultorio, el "Número" no se autogenera:
// lo carga el técnico a mano (es el número físico del consultorio), y el
// hostname no lleva el código de Tipo (Edificio-Piso-Sector-Número)
const SECTOR_CONSULTORIO = 'CON';

export default function Builder() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Estados para almacenar los catálogos dinámicos desde la Base de Datos
  const [edificios, setEdificios] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [pisos, setPisos] = useState([]);       
  const [sectores, setSectores] = useState([]); 

  // Estados del formulario (IDs numéricos que espera el Backend)
  const [edifId, setEdifId] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [pisoId, setPisoId] = useState('');
  const [sectorId, setSectorId] = useState('');
  
  // Estados auxiliares (Códigos string para armar la visual del Hostname)
  const [edifCode, setEdifCode] = useState('');
  const [tipoCode, setTipoCode] = useState('');
  const [pisoCode, setPisoCode] = useState('');
  const [sectorCode, setSectorCode] = useState('');

  // Campos adicionales del formulario
  const [nextNum, setNextNum] = useState('');
  const [usuario, setUsuario] = useState('');
  const [notas, setNotas] = useState('');

  const [hostname, setHostname] = useState('');
  const [display, setDisplay] = useState('');
  const [lockTimer, setLockTimer] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockMsg, setLockMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  // ── 1. Carga inicial de Edificios, Tipos y Sectores desde la Base de Datos ──────
  useEffect(() => {
    client.get('/nomenclatures/catalogs/buildings')
      .then(res => setEdificios(res.data))
      .catch(err => console.error('Error al traer edificios desde BD:', err));

    client.get('/nomenclatures/catalogs/device-types')
      .then(res => setTipos(res.data))
      .catch(err => console.error('Error al traer tipos desde BD:', err));

    // Los sectores ahora son un catálogo global: no dependen del piso/edificio
    client.get('/nomenclatures/catalogs/sectors')
      .then(res => setSectores(res.data))
      .catch(err => console.error('Error al traer sectores desde BD:', err));
  }, []);

  // ── 2. Carga dinámica de Pisos filtrados por el Edificio seleccionado ──────
  useEffect(() => {
    if (!edifId) {
      setPisos([]);
      setPisoId('');
      setPisoCode('');
      return;
    }
    client.get(`/nomenclatures/catalogs/floors/${edifId}`)
      .then(res => setPisos(res.data))
      .catch(err => console.error('Error al traer pisos dependientes:', err));
  }, [edifId]);

  // ── 4. Consulta del Próximo Número Secuencial (Enviando IDs numéricos) ──────
// ── 4. Consulta del Próximo Número Secuencial (Búsqueda forzada de IDs numéricos) ──────
useEffect(() => {
  const esConsultorio = sectorCode === SECTOR_CONSULTORIO;

  // Consultorio: el número lo escribe el técnico a mano, no se autogenera
  if (esConsultorio) { 
    setNextNum(''); 
    return; 
  }

  // Buscamos el objeto real en los catálogos usando los códigos actuales
  const edificioReal = edificios.find(e => e.code === edifCode || e.id === edifId);
  const tipoReal = tipos.find(t => t.code === tipoCode || t.id === tipoId);
  const sectorReal = sectores.find(s => s.code === sectorCode || s.id === sectorId);
  const sinSector = TIPOS_SIN_SECTOR_EN_CODIGO.includes(tipoCode);

  // Si no tenemos los IDs correspondientes, no ejecutamos la petición
  // (Sector solo es obligatorio para los tipos que sí lo usan)
  if (!edificioReal?.id || !tipoReal?.id || (!sinSector && !sectorReal?.id)) { 
    setNextNum(''); 
    return; 
  }

  client.get('/nomenclatures/next', { 
    params: sinSector
      ? { tipo: tipoReal.id, edificio: edificioReal.id }                        // TT, LL, CAM: sin sector
      : { tipo: tipoReal.id, edificio: edificioReal.id, sector: sectorReal.id } // PC, NB, resto
  })
    .then(res => setNextNum(res.data.next))
    .catch(() => setNextNum('01')); // Respaldo por si la base de datos está vacía
}, [edifCode, tipoCode, sectorCode, edificios, tipos, sectores]);

  // ── 5. Construcción dinámica de la cadena del Hostname usando Códigos ──────
  useEffect(() => {
    const sinSector = TIPOS_SIN_SECTOR_EN_CODIGO.includes(tipoCode);
    const esConsultorio = sectorCode === SECTOR_CONSULTORIO;
    const camposCompletos = sinSector
      ? edifCode && tipoCode && pisoCode && nextNum
      : edifCode && tipoCode && pisoCode && sectorCode && nextNum;

    if (!camposCompletos) {
      setHostname(''); 
      setDisplay(''); 
      return;
    }
    const num = String(nextNum).padStart(2, '0');

    if (esConsultorio) {
      // Sector Consultorio -> Edificio-Piso-Sector-Número (sin Tipo en el código)
      setDisplay(`${edifCode}-${pisoCode}-${sectorCode}-${num}`);
      setHostname(`${edifCode}${pisoCode}${sectorCode}${num}`);
    } else if (sinSector) {
      // TT, LL, CAM -> Tipo-Edificio-Piso-Número (sin Sector en el código)
      setDisplay(`${tipoCode}-${edifCode}-${pisoCode}${num}`);
      setHostname(`${tipoCode}${edifCode}${pisoCode}${num}`);
    } else {
      // PC, NB (y el resto por defecto) -> Edificio-Piso-Sector-Tipo-Número
      setDisplay(`${edifCode}-${pisoCode}-${sectorCode}-${tipoCode}${num}`);
      setHostname(`${edifCode}${pisoCode}${sectorCode}${tipoCode}${num}`);
    }
  }, [edifCode, tipoCode, pisoCode, sectorCode, nextNum]);

  // ── Temporizador de la reserva ───────────────────────────────
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

  // ── Ejecutar reserva temporal en Redis ────────────────────────
  const handleLock = async () => {
    if (!hostname) return;
    setLockMsg(''); setError('');
    try {
      const res = await client.post('/nomenclatures/lock', { hostname });
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

  // ── Confirmar y Guardar en PostgreSQL ─────────────────────────
  const handleSave = async () => {
    const requiereUsuario = TIPOS_CON_USUARIO.includes(tipoCode);

    if (!locked)   { setError('Reservá el hostname antes de guardar.'); return; }
    if (requiereUsuario && !usuario) { setError('El usuario Windows es obligatorio para este tipo de dispositivo.'); return; }

    const sinSector = TIPOS_SIN_SECTOR_EN_CODIGO.includes(tipoCode);

    // Control para evitar el envío de NaNs en el sequential_number
    const parsedSeq = parseInt(nextNum, 10);
    const finalSequence = isNaN(parsedSeq) ? 1 : parsedSeq;

    // Debug en consola para auditar qué IDs se están por enviar en la petición
    console.log("Enviando Payload a la API:", { 
      hostname, 
      tipo: tipoId, 
      edificio: edifId, 
      sector: sinSector ? null : sectorId, 
      sequential_number: finalSequence 
    });

    setSaving(true); setError('');
    try {
      const res = await client.post('/nomenclatures', {
        hostname,
        tipo: Number(tipoId) || 1,                          // Forzamos conversión a número
        edificio: Number(edifId) || 1,                      // Forzamos conversión a número
        sector: sinSector ? null : (Number(sectorId) || 1),  // TT/LL/CAM no llevan sector
        sequential_number: finalSequence,       // Número entero garantizado
        usuario_windows: requiereUsuario ? usuario : null,
        notes: notas || null
      });
      setSaved(res.data);
      setLocked(false); 
      setLockTimer(0);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ── Resetear Formulario ──────────────────────────────────
  const handleClear = () => {
    setEdifId(''); setEdifCode('');
    setTipoId(''); setTipoCode('');
    setPisoId(''); setPisoCode('');
    setSectorId(''); setSectorCode('');
    setUsuario(''); setNotas('');
    setLocked(false); setLockTimer(0);
    setLockMsg(''); setError(''); setSaved(null);
  };

  const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  // Manejadores de cambios en listas desplegables
  const handlePisoChange = (e) => {
    const selectedId = e.target.value;
    setPisoId(selectedId);
    const obj = pisos.find(p => String(p.id) === String(selectedId));
    setPisoCode(obj ? obj.code : '');
  };

  const handleSectorChange = (e) => {
    const selectedId = e.target.value;
    setSectorId(selectedId);
    const obj = sectores.find(s => String(s.id) === String(selectedId));
    setSectorCode(obj ? obj.code : '');
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
          <button style={s.btnGhost} onClick={() => navigate('/historial')}>Historial</button>
          {user?.rol === 'admin' && (
            <button style={s.btnGhost} onClick={() => navigate('/admin')}>Admin</button>
          )}
          <button style={s.btnGhost} onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={s.body}>
        {saved && (
          <div style={s.savedBox}>
            <div style={s.savedTitle}>✅ Hostname registrado con éxito</div>
            <div style={s.savedHn}>{saved.generated_code || saved.hostname}</div>
            <button style={{...s.btnPrimary, marginTop:12}} onClick={handleClear}>
              Crear otro
            </button>
          </div>
        )}

        {!saved && <>
          {/* ── Bloque Edificios de Base de Datos ── */}
          <div style={s.card}>
            <div style={s.cardTitle}>Edificio</div>
            <div style={s.gridSel3}>
              {edificios.map(e => (
                <div key={e.id}
                  style={{...s.selBtn, ...(edifId === e.id ? s.selActive : {})}}
                  onClick={() => { 
                    setEdifId(e.id);     // Guarda la clave numérica primaria
                    setEdifCode(e.code); // Guarda 'AU', 'LI', etc.
                  }}>
                  <div style={s.selCode}>{e.code}</div>
                  <div style={s.selName}>{e.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Bloque Tipos de Dispositivo de Base de Datos ── */}
          <div style={s.card}>
            <div style={s.cardTitle}>Tipo de dispositivo</div>
            <div style={s.gridSel3}>
              {tipos.map(t => (
                <div key={t.id}
                  style={{...s.selBtn, ...(tipoId === t.id ? s.selActive : {})}}
                  onClick={() => { 
                    setTipoId(t.id);     // Guarda la clave numérica primaria
                    setTipoCode(t.code); // Guarda 'PC', 'CEL', etc.
                  }}>
                  <div style={{fontSize:20}}>📦</div>
                  <div style={s.selCode}>{t.code}</div>
                  <div style={s.selName}>{t.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Desplegables Dinámicos ── */}
          <div style={s.card}>
            <div style={s.cardTitle}>Ubicación</div>
            <div style={s.grid3}>
              <div style={s.field}>
                <label style={s.label}>Piso</label>
                <select style={s.select} value={pisoId} onChange={handlePisoChange} disabled={!edifId}>
                  <option value="">{edifId ? '-- Seleccionar --' : 'Elija Edificio primero'}</option>
                  {pisos.map(p => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}
                </select>
              </div>
              {!TIPOS_SIN_SECTOR_EN_CODIGO.includes(tipoCode) && (
                <div style={s.field}>
                  <label style={s.label}>Sector</label>
                  <select style={s.select} value={sectorId} onChange={handleSectorChange}>
                    <option value="">-- Seleccionar --</option>
                    {sectores.map(sec => <option key={sec.id} value={sec.id}>{sec.name} ({sec.code})</option>)}
                  </select>
                </div>
              )}
              <div style={s.field}>
                <label style={s.label}>
                  {sectorCode === SECTOR_CONSULTORIO ? 'Número de consultorio *' : 'Número (auto)'}
                </label>
                {sectorCode === SECTOR_CONSULTORIO ? (
                  <input
                    style={s.select}
                    value={nextNum}
                    onChange={e => setNextNum(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ej: 5"
                    inputMode="numeric"
                  />
                ) : (
                  <input style={{...s.select, background:'#f0efe9', color:'#888'}} value={nextNum} readOnly />
                )}
              </div>
            </div>
          </div>

          {/* ── Visualización y Reserva del Hostname ── */}
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

          {/* ── Formulario complementario ── */}
          <div style={s.card}>
            <div style={s.cardTitle}>Datos del equipo</div>
            <div style={s.grid2}>
              {TIPOS_CON_USUARIO.includes(tipoCode) ? (
                <>
                  <div style={s.field}>
                    <label style={s.label}>Usuario Windows *</label>
                    <input style={s.input} value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="usuario.apellido" />
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Técnico asignante</label>
                    <input style={{...s.input, background:'#f0efe9', color:'#888'}} value={`${user?.nombre} <${user?.email}>`} readOnly />
                  </div>
                </>
              ) : (
                <div style={s.field}>
                  <label style={s.label}>Técnico asignante</label>
                  <input style={{...s.input, background:'#f0efe9', color:'#888'}} value={`${user?.nombre} <${user?.email}>`} readOnly />
                </div>
              )}
              <div style={{...s.field, gridColumn:'1/-1'}}>
                <label style={s.label}>Notas</label>
                <textarea style={{...s.input, minHeight:60, resize:'vertical'}} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones opcionales" />
              </div>
            </div>

            {error && <div style={s.errorBox}>{error}</div>}

            <div style={{display:'flex', gap:8, marginTop:16}}>
              <button style={{...s.btnPrimary, opacity: locked ? 1 : .5}} onClick={handleSave} disabled={saving}>
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
  gridSel3:   { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 },
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
  savedSub:   { fontSize:13, color:'#888', marginTop:4 }
};