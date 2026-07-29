import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
});

// Agrega el token automáticamente en cada request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si el token expiró, manda al login (pero no si el 401 vino del login mismo,
// para no pisar el mensaje de "credenciales incorrectas")
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;