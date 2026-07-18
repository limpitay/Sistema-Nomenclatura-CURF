import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

// Solo estos tipos de dispositivo requieren cargar Usuario Windows
const TIPOS_CON_USUARIO = ['PC', 'NB'];

// Estos tipos arman el hostname especial como Tipo-Piso-Edificio-Número (sin Sector)
const TIPOS_SIN_SECTOR_EN_CODIGO = ['TT', 'LL', 'CAM', 'FID'];

// Clave del sector consultorios configurada en tu Base de Datos
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
  const [serie, setSerie] = useState('');
  const [notas, setNotas] = useState('');

  const [hostname, setHostname] = useState('');
  const [display, setDisplay] = useState('');
  const [lockTimer, setLockTimer] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockMsg, setLockMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  // Flag dinámico: Las PC y NB son las únicas que operan con Sector de forma obligatoria
  const esComputadora = tipoCode === 'PC' || tipoCode === 'NB';
  const esConsultorio = sectorCode === SECTOR_CONSULTORIO;

  // ── 1. Carga inicial de Edificios, Tipos y Sectores desde la Base de Datos ──────
  useEffect(() => {
    client.get('/nomenclatures/catalogs/buildings')
      .then(res => setEdificios(res.data))
      .catch(err => console.error('Error al traer edificios desde BD:', err));

    client.get('/nomenclatures/catalogs/device-types')
      .then(res => setTipos(res.data))
      .catch(err => console.error('Error al traer tipos desde BD:', err));

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

  // ── 4. Consulta del Próximo Número Secuencial ──────
  useEffect(() => {
    // Si es consultorio, el número se escribe a mano, no le pedimos nada al backend
    if (esConsultorio) { 
      return; 
    }

    if (!edifId || !tipoId) { setNextNum(''); return; }
    if (esComputadora && !sectorId) { setNextNum(''); return; }

    client.get('/nomenclatures/next', { 
      params: { tipo: tipoId, edificio: edifId, sector: esComputadora ? sectorId : undefined } 
    })
      .then(res => setNextNum(res.data.next))
      .catch(() => setNextNum('01'));
  }, [edifId, tipoId, sectorId, esComputadora, esConsultorio]);

  // ── 5. Construcción dinámica de la cadena del Hostname usando Códigos ──────
  useEffect(() => {
    const sinSector = TIPOS_SIN_SECTOR_EN_CODIGO.includes(tipoCode);
    const camposCompletos = esConsultorio
      ? edifCode && pisoCode && nextNum
      : sinSector
        ? edifCode && tipoCode && pisoCode && nextNum
        : edifCode && tipoCode && pisoCode && sectorCode && nextNum;

    if (!camposCompletos) {
      setHostname(''); 
      setDisplay(''); 
      return;
    }

    const num = String(nextNum).padStart(2, '0');

    if (esConsultorio) {
      // Excepción Consultorios -> Edificio-Piso-Sector-Número (Omitiendo el Tipo de hardware)
      setDisplay(`${edifCode}-${pisoCode}-${sectorCode}-${num}`);
      setHostname(`${edifCode}${pisoCode}${sectorCode}${num}`);
    } else if (sinSector) {
      // Especiales -> Tipo-Piso-Edificio-Número
      setDisplay(`${tipoCode}-${pisoCode}-${edifCode}-${num}`);
      setHostname(`${tipoCode}${pisoCode}${edifCode}${num}`);
    } else {
      // Computadoras estándar -> Edificio-Piso-Sector-Tipo-Número
      setDisplay(`${edifCode}-${pisoCode}-${sectorCode}-${tipoCode}-${num}`);
      setHostname(`${edifCode}${pisoCode}${sectorCode}${tipoCode}${num}`);
    }
  }, [edifCode, tipoCode, pisoCode, sectorCode, nextNum, esComputadora, esConsultorio]);

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

  const handleLock = async () => {
    if (!hostname) return;
    setLockMsg(''); setError('');
    try {
      const res = await client.post('/nomenclatures/lock', { hostname });
      setLocked(true);
      setLockTimer(res.data.expires_in);
    } catch (err) {
      const d = err.response?.data;
      if (d?.locked_by) {
        setLockMsg(`🔒 Reservado por ${d.locked_by} — expira en ${Math.ceil(d.expires_in / 60)} min`);
      } else {
        setLockMsg(d?.error || 'Error al reservar');
      }
    }
  };

  const handleSave = async () => {
    const requiereUsuario = TIPOS_CON_USUARIO.includes(tipoCode);

    if (!locked) { setError('Reservá el hostname antes de guardar.'); return; }
    if (requiereUsuario && !usuario.trim()) { setError('El usuario Windows es obligatorio para este equipo.'); return; }

    setSaving(true); setError('');
    try {
      await client.post('/nomenclatures', {
        hostname,
        tipo: Number(tipoId),
        edificio: Number(edifId),
        floor_id: Number(pisoId),
        sector: esComputadora ? Number(sectorId) : null,
        sequential_number: parseInt(nextNum, 10),
        usuario_windows: requiereUsuario ? usuario : null,
        numero_serie: serie || null,
        notas: notas || null
      });
      setSaved({ hostname });
      setLocked(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setEdifId(''); setEdifCode('');
    setTipoId(''); setTipoCode('');
    setPisoId(''); setPisoCode('');
    setSectorId(''); setSectorCode('');
    setUsuario(''); setSerie(''); setNotas('');
    setLocked(false); setLockTimer(0);
    setLockMsg(''); setError(''); setSaved(null);
  };

  const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  return (
    <div style={s.page}>
      {/* ── Header Corregido ── */}
      <div style={s.header}>
        <div>
          <span style={s.pill}>CURF</span>
          <span style={s.htitle}> Sistema de Nomenclatura</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.userChip}>👤 {user?.nombre}</span>
          <button style={s.btnGhost}  onClick={() => navigate('/historial')}>Historial</button>
          
          <button onClick={logout}>Salir</button>
        </div>
      </div>

      <div style={s.body}>
        {saved ? (
          <div style={s.savedBox}>
            <div style={s.savedTitle}>✅ Hostname registrado con éxito</div>
            <div style={s.savedHn}>{saved.hostname}</div>
            <button style={{...s.btnPrimary, marginTop:12}} onClick={handleClear}>Crear otro</button>
          </div>
        ) : (
          <>
            {/* ── Bloque Edificios ── */}
            <div style={s.card}>
              <div style={s.cardTitle}>Edificio</div>
              <div style={s.gridSel3}>
                {edificios.map(e => (
                  <div key={e.id}
                    style={{...s.selBtn, ...(edifId === e.id ? s.selActive : {})}}
                    onClick={() => { setEdifId(e.id); setEdifCode(e.code); }}>
                    <div style={s.selCode}>{e.code}</div>
                    <div style={s.selName}>{e.name}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Bloque Tipos de Dispositivo ── */}
            <div style={s.card}>
              <div style={s.cardTitle}>Tipo de dispositivo</div>
              <div style={s.gridSel3}>
                {tipos.map(t => (
                  <div key={t.id}
                    style={{...s.selBtn, ...(tipoId === t.id ? s.selActive : {})}}
                    onClick={() => { setTipoId(t.id); setTipoCode(t.code); }}>
                    
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
                  <select style={s.select} value={pisoId} onChange={e => {
                    setPisoId(e.target.value);
                    const obj = pisos.find(p => String(p.id) === String(e.target.value));
                    setPisoCode(obj ? obj.code : '');
                  }} disabled={!edifId}>
                    <option value="">{edifId ? '-- Seleccionar --' : 'Elija Edificio primero'}</option>
                    {pisos.map(p => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}
                  </select>
                </div>

                <div style={s.field}>
                  <label style={s.label}>Sector / Área</label>
                  {!TIPOS_SIN_SECTOR_EN_CODIGO.includes(tipoCode) ? (
                    <select style={s.select} value={sectorId} onChange={e => {
                      setSectorId(e.target.value);
                      const obj = sectores.find(sec => String(sec.id) === String(e.target.value));
                      setSectorCode(obj ? obj.code : '');
                      if(obj && obj.code === SECTOR_CONSULTORIO) { setNextNum(''); }
                    }} disabled={!pisoId}>
                      <option value="">-- Seleccionar --</option>
                      {sectores.map(sec => <option key={sec.id} value={sec.id}>{sec.name} ({sec.code})</option>)}
                    </select>
                  ) : (
                    <input style={{...s.select, background:'#f0efe9', color:'#999'}} value="No requerido" readOnly />
                  )}
                </div>

                <div style={s.field}>
                  <label style={s.label}>
                    {esConsultorio ? 'Número de consultorio *' : 'Número (auto)'}
                  </label>
                  {esConsultorio ? (
                    <input
                      style={s.select}
                      value={nextNum}
                      onChange={e => setNextNum(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ej: 05"
                      inputMode="numeric"
                    />
                  ) : (
                    <input style={{...s.select, background:'#f0efe9', color:'#888'}} value={nextNum} readOnly />
                  )}
                </div>
              </div>
            </div>

            {/* ── Nomenclatura Generada ── */}
            {hostname && (
              <div style={s.card}>
                <div style={s.cardTitle}>Nomenclatura</div>
                <div style={s.previewBox}>
                  <div><div style={s.previewLabel}>Impreso</div><div style={s.previewDisplay}>{display}</div></div>
                  <div><div style={s.previewLabel}>Active Directory</div><div style={s.previewFinal}>{hostname}</div></div>
                  <div>
                    {!locked ? <button style={s.btnPrimary} onClick={handleLock}>🔒 Reservar</button> : <div style={s.timerChip}>⏱ {fmtTime(lockTimer)}</div>}
                  </div>
                  {lockMsg && <div style={{...s.lockWarn, width:'100%', marginTop:6}}>{lockMsg}</div>}
                </div>
              </div>
            )}

            {/* ── Formulario Complementario ── */}
            <div style={s.card}>
              <div style={s.cardTitle}>Datos del equipo</div>
              <div style={s.grid2}>
                <div style={s.field}>
                  <label style={s.label}>Usuario Windows {TIPOS_CON_USUARIO.includes(tipoCode) && '*'}</label>
                  <input 
                    style={{...s.input, ...(!TIPOS_CON_USUARIO.includes(tipoCode) ? {background:'#f0efe9', color:'#999'} : {})}} 
                    value={usuario} 
                    onChange={e => setUsuario(e.target.value)} 
                    placeholder={TIPOS_CON_USUARIO.includes(tipoCode) ? "usuario.apellido" : "No aplica"} 
                    disabled={!TIPOS_CON_USUARIO.includes(tipoCode)}
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Número de serie</label>
                  <input style={s.input} value={serie} onChange={e => setSerie(e.target.value)} placeholder="Opcional" />
                </div>
                <div style={{...s.field, gridColumn:'1/-1'}}>
                  <label style={s.label}>Notas</label>
                  <textarea style={{...s.input, minHeight:60, resize:'vertical'}} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones opcionales" />
                </div>
              </div>

              {error && <div style={s.errorBox}>{error}</div>}

              <div style={{display:'flex', gap:8, marginTop:16}}>
                <button style={{...s.btnPrimary, opacity: locked ? 1 : .5}} onClick={handleSave} disabled={saving}>
                  {saving ? 'Guardando...' : 'Registrar'}
                </button>
                <button style={s.btnGhost} onClick={handleClear}>Limpiar</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight:'100vh', background:'#f4f3ef', fontFamily:'sans-serif' },
  header: { background:'#fff', borderBottom:'1px solid #dddbd3', padding:'12px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' },
  pill: { background:'#1a52be', color:'#fff', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:700, marginRight:6 },
  htitle: { fontWeight:700 },
  userChip: { background:'#f0efe9', padding:'4px 10px', borderRadius:20, fontSize:12, marginRight:8 },
  body: { maxWidth:860, margin:'0 auto', padding:'24px 16px' },
  card: { background:'#fff', border:'1px solid #dddbd3', borderRadius:10, padding:20, marginBottom:14 },
  cardTitle: { fontSize:11, fontWeight:700, color:'#999', textTransform:'uppercase', marginBottom:12 },
  gridSel3: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 },
  grid3: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
  grid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  selBtn: { border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 4px', textAlign:'center', cursor:'pointer', background:'#fff' },
  selActive: { borderColor:'#1a52be', background:'#eaf0ff' },
  selCode: { fontWeight:700, color:'#1a52be', fontFamily:'monospace' },
  selName: { fontSize:10, color:'#999' },
  field: { display:'flex', flexDirection:'column', gap:4 },
  label: { fontSize:11, fontWeight:700, color:'#585754' },
  select: { border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 10px', fontSize:13, outline:'none' },
  input: { border:'1px solid #c8c6bc', borderRadius:6, padding:'8px 10px', fontSize:13, outline:'none' },
  previewBox: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f4f3ef', padding:16, borderRadius:6, flexWrap:'wrap' },
  previewLabel: { fontSize:10, color:'#999', textTransform:'uppercase' },
  previewDisplay: { fontSize:16, color:'#555', fontFamily:'monospace' },
  previewFinal: { fontSize:20, fontWeight:700, color:'#1a52be', fontFamily:'monospace' },
  timerChip: { background:'#e6f5ec', color:'#1a7a3c', padding:'6px 12px', borderRadius:20, fontWeight:700 },
  lockWarn: { fontSize:11, color:'#8a5a00', background:'#fdf3dc', border:'1px solid #f0d090', borderRadius:4, padding:'4px 8px' },
  btnPrimary: { background:'#1a52be', color:'#fff', border:'none', borderRadius:6, padding:'9px 18px', fontWeight:600, cursor:'pointer' },
btnGhost:   { background:'#f8f9fa', color:'#1a52be', border:'1px solid #1a52be', borderRadius:6, padding:'8px 14px', fontSize:13, fontWeight:600, cursor:'pointer', marginRight:4 },  errorBox: { background:'#fceaea', color:'#b83030', padding:10, borderRadius:6, marginTop:10, fontSize:13 },
  savedBox: { background:'#fff', border:'1px solid #9adfc8', borderRadius:10, padding:30, textAlign:'center' },
  savedTitle: { color:'#1a7a3c', fontWeight:600, marginBottom:10 },
  savedHn: { fontSize:26, fontWeight:700, color:'#1a52be', marginBottom:12, fontFamily:'monospace' }
};


