import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import Login   from './pages/Login';
import Builder from './pages/Builder';
import History from './pages/History';
import Admin   from './pages/Admin';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{padding:40}}>Cargando...</div>;
  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{padding:40}}>Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  return user.rol === 'admin' ? children : <Navigate to="/" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <PrivateRoute><Builder /></PrivateRoute>
          }/>
          <Route path="/historial" element={
            <PrivateRoute><History /></PrivateRoute>
          }/>
          <Route path="/admin" element={
            <AdminRoute><Admin /></AdminRoute>
          }/>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}