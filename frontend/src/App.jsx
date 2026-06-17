import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Catalogo from "./pages/Catalogo";
import Login from "./pages/Login";

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("aestheva_user"));
  } catch {
    return null;
  }
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("aestheva_token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const user = getUser();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout user={user}>
              <Catalogo user={user} />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
