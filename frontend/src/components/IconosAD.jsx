// Íconos al estilo de la consola "Usuarios y equipos de Active Directory",
// para las secciones Equipos AD y Áreas AD.

const base = (size) => ({
  width: size, height: size, flexShrink: 0, verticalAlign: 'middle', display: 'inline-block',
});

/** Unidad organizativa: carpeta amarilla con una hojita adentro */
export function IconoOU({ size = 16, style }) {
  return (
    <svg viewBox="0 0 16 16" style={{ ...base(size), ...style }} aria-hidden="true">
      <path d="M1 3.5C1 2.7 1.6 2 2.4 2h3.5l1.5 1.6h6.2c.8 0 1.4.6 1.4 1.4V13c0 .6-.4 1-1 1H2c-.6 0-1-.4-1-1z" fill="#d9a12b" />
      <rect x="4" y="3.6" width="8" height="6.4" rx=".4" fill="#fff" stroke="#8c8c8c" strokeWidth=".6" />
      <path d="M5.4 5.4h5.2M5.4 6.8h5.2M5.4 8.2h3.4" stroke="#4a7fd4" strokeWidth=".8" />
      <path d="M1 6.6c0-.5.4-.9.9-.9h12.2c.5 0 .9.4.9.9V13c0 .6-.4 1-1 1H2c-.6 0-1-.4-1-1z" fill="#f4c950" />
      <path d="M1.4 6.4h13.2" stroke="#fbe29a" strokeWidth=".7" />
    </svg>
  );
}

/** Cuenta de equipo: monitor con pantalla azul */
export function IconoEquipo({ size = 16, style, deshabilitado = false }) {
  return (
    <svg viewBox="0 0 16 16" style={{ ...base(size), ...(deshabilitado ? { opacity: .45, filter: 'grayscale(1)' } : {}), ...style }} aria-hidden="true">
      <rect x="1" y="2" width="14" height="9.5" rx="1" fill="#5b6b7d" />
      <rect x="2" y="3" width="12" height="7.5" rx=".4" fill="#3d8ee6" />
      <path d="M2 3h12v2.6C10 4.6 6 5.6 2 8.2z" fill="#7cb6f2" />
      <path d="M6.2 11.5h3.6l.5 2H5.7z" fill="#8a96a3" />
      <rect x="4" y="13.3" width="8" height="1.2" rx=".5" fill="#5b6b7d" />
    </svg>
  );
}
