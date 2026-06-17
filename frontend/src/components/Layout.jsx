import { useNavigate } from "react-router-dom";
import styles from "./Layout.module.css";

export default function Layout({ user, children }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("aestheva_token");
    localStorage.removeItem("aestheva_user");
    navigate("/login");
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h1>Aestheva</h1>
          <span>OS</span>
        </div>

        <nav className={styles.nav}>
          <a href="/ventas" className={styles.navItem}>Ventas del Mes</a>
          {user?.role === "administrador" && (
            <>
              <a href="/gastos" className={styles.navItem}>Gastos</a>
              <a href="/dashboard" className={styles.navItem}>Dashboard</a>
              <a href="/anual" className={styles.navItem}>Análisis Anual</a>
              <div className={styles.navDivider} />
              <a href="/servicios" className={styles.navItem}>Servicios</a>
              <a href="/inventario" className={styles.navItem}>Inventario</a>
            </>
          )}
          {user?.role !== "administrador" && (
            <a href="/servicios" className={styles.navItem}>Servicios</a>
          )}
        </nav>

        <div className={styles.user}>
          <p className={styles.userName}>{user?.display_name}</p>
          <p className={styles.userRole}>
            {user?.role === "administrador" ? "Administrador" : "Recepcionista"}
          </p>
          <button className={styles.logoutBtn} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
