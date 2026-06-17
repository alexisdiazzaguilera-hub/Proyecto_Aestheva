import { useEffect, useState } from "react";
import { api } from "../api/client";
import styles from "./Catalogo.module.css";

const AREA_LABELS = {
  cosmiatra: "Cosmiatra",
  estetico: "Estético",
  nutricion: "Nutrición",
};

export default function Catalogo({ user }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/services/catalog")
      .then(setServices)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner" />;
  if (error) return <p style={{ color: "var(--danger)", padding: 24 }}>{error}</p>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Catálogo de Servicios</h2>
        {user?.role === "administrador" && (
          <p className={styles.hint}>Mostrando precios y costos (vista administrador)</p>
        )}
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Servicio</th>
              <th>Área</th>
              <th>Duración</th>
              {user?.role === "administrador" && (
                <>
                  <th>Precio</th>
                  <th>Costo Variable</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr>
                <td colSpan={user?.role === "administrador" ? 6 : 4} style={{ textAlign: "center", color: "var(--text-light)", padding: 32 }}>
                  No hay servicios registrados aún.
                </td>
              </tr>
            )}
            {services.map((s) => (
              <tr key={s.id}>
                <td className={styles.sku}>{s.sku}</td>
                <td>{s.name}</td>
                <td>
                  <span className={`badge-area badge-${s.area}`}>
                    {AREA_LABELS[s.area] ?? s.area}
                  </span>
                </td>
                <td>{s.duration_min} min</td>
                {user?.role === "administrador" && (
                  <>
                    <td className={styles.money}>${Number(s.sale_price).toLocaleString("es-MX")}</td>
                    <td className={styles.money}>${Number(s.variable_cost).toLocaleString("es-MX")}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
