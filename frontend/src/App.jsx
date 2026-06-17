import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Anual from "./pages/Anual";
import Dashboard from "./pages/Dashboard";
import Gastos from "./pages/Gastos";
import Inventario from "./pages/Inventario";
import Login from "./pages/Login";
import Servicios from "./pages/Servicios";
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
      <Route path="/" element={<Navigate to="/ventas" replace />} />
      <Route path="*" element={<Navigate to="/servicios" replace />} />
    </Routes>
  );
}
