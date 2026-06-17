import { useEffect, useState } from "react";
import { api } from "../api/client";
import styles from "./Depreciacion.module.css";

const fmt = (n) => Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function Depreciacion() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/dashboard/depreciation")
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalMonthly = rows.reduce((s, r) => s + Number(r.monthly_depreciation), 0);
  const totalRemaining = rows.reduce((s, r) => s + Number(r.remaining_value ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.acquisition_cost), 0);

  function downloadExport(format) {
    const token = localStorage.getItem("aestheva_token");
    window.open(`${API_BASE}/exports/products?format=${format}&_token=${token}`, "_blank");
  }

  function exportDepreciation() {
    const csv = [
      ["Equipo", "Costo adquisición", "Vida útil (meses)", "Dep. mensual", "Costo/sesión", "Meses transcurridos", "Dep. acumulada", "Valor restante"],
      ...rows.map((r) => [
        r.name, r.acquisition_cost, r.useful_life_months,
        r.monthly_depreciation, r.cost_per_session,
        r.months_elapsed, r.accumulated_depreciation, r.remaining_value,
      ]),
    ].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "depreciacion.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ padding: 32 }}>Cargando...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Depreciación de Equipos</h2>
        <button className={`btn btn-outline ${styles.exportBtn}`} onClick={exportDepreciation}>
          Exportar CSV
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Equipos activos</span>
          <span className={styles.summaryValue}>{rows.length}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Dep. mensual total</span>
          <span className={styles.summaryValue}>${fmt(totalMonthly)}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Valor en libros total</span>
          <span className={styles.summaryValue}>${fmt(totalRemaining)}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Inversión total</span>
          <span className={styles.summaryValue}>${fmt(totalCost)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>No hay equipos registrados.</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Costo adquisición</th>
                <th>Vida útil</th>
                <th>Dep. mensual</th>
                <th>Costo / sesión</th>
                <th>Avance</th>
                <th>Dep. acumulada</th>
                <th>Valor restante</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.useful_life_months > 0
                  ? Math.min(100, Math.round((r.months_elapsed / r.useful_life_months) * 100))
                  : 0;
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>${fmt(r.acquisition_cost)}</td>
                    <td>{r.useful_life_months} meses</td>
                    <td>${fmt(r.monthly_depreciation)}</td>
                    <td>${fmt(r.cost_per_session)}</td>
                    <td style={{ minWidth: 120 }}>
                      <span style={{ fontSize: 11, color: "var(--text-light)" }}>
                        {r.months_elapsed}/{r.useful_life_months} meses ({pct}%)
                      </span>
                      <div className={styles.progressBar}>
                        <div
                          className={`${styles.progressFill} ${pct >= 100 ? styles.progressFillDone : ""}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td>${fmt(r.accumulated_depreciation)}</td>
                    <td style={{ color: Number(r.remaining_value) <= 0 ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
                      ${fmt(r.remaining_value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
