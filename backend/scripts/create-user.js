// Crea un usuario directamente en la base de datos (no existe endpoint de
// administración de usuarios). Uso:
//   node scripts/create-user.js "Nombre Apellido" email@dominio.com contraseña [admin|technician]
const bcrypt = require('bcrypt');
const db = require('../src/db');

async function main() {
  const [nombre, email, password, rol = 'technician'] = process.argv.slice(2);

  if (!nombre || !email || !password) {
    console.error('Uso: node scripts/create-user.js "Nombre Apellido" email@dominio.com contraseña [admin|technician]');
    process.exitCode = 1;
    return;
  }
  if (!['admin', 'technician'].includes(rol)) {
    console.error(`Rol inválido: "${rol}". Debe ser "admin" o "technician".`);
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    const result = await db.query(
      `INSERT INTO users (nombre, email, password, rol) VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, rol`,
      [nombre, email, hash, rol]
    );
    console.log('Usuario creado:', result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      console.error(`Ya existe un usuario con el email "${email}".`);
    } else {
      console.error('Error al crear el usuario:', err.message);
    }
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
