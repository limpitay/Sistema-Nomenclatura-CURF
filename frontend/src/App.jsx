import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login   from './pages/Login';
import Builder from './pages/Builder';
import History from './pages/History';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{padding:40}}>Cargando...</div>;
  return user ? children : <Navigate to="/login" />;
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
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}