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
          <a href="/" className={styles.navItem}>
            <span>Catálogo</span>
          </a>
          {/* Fase 2+ agregará más ítems */}
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
