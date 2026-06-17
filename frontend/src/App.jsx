import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Anual from "./pages/Anual";
import Configuracion from "./pages/Configuracion";
import Dashboard from "./pages/Dashboard";
import Depreciacion from "./pages/Depreciacion";
import Equilibrio from "./pages/Equilibrio";
import Gastos from "./pages/Gastos";
import Inventario from "./pages/Inventario";
import Login from "./pages/Login";
import Profesionales from "./pages/Profesionales";
import Servicios from "./pages/Servicios";
import Simulador from "./pages/Simulador";
import Ventas from "./pages/Ventas";

function getUser() {
  try { return JSON.parse(localStorage.getItem("aestheva_user")); }
  catch { return null; }
}

function ProtectedRoute({ children, adminOnly = false }) {
  const token = localStorage.getItem("aestheva_token");
  const user = getUser();
  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== "administrador") return <Navigate to="/servicios" replace />;
  return children;
}

export default function App() {
  const user = getUser();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/servicios" element={
        <ProtectedRoute>
          <Layout user={user}><Servicios user={user} /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/inventario" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Inventario /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ventas" element={
        <ProtectedRoute>
          <Layout user={user}><Ventas user={user} /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Dashboard /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/gastos" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Gastos /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/anual" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Anual /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/profesionales" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Profesionales /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/configuracion" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Configuracion /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/depreciacion" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Depreciacion /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/equilibrio" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Equilibrio /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/simulador" element={
        <ProtectedRoute adminOnly>
          <Layout user={user}><Simulador /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/" element={<Navigate to="/ventas" replace />} />
      <Route path="*" element={<Navigate to="/servicios" replace />} />
    </Routes>
  );
}
