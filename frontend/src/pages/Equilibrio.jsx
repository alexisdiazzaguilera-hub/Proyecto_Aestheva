import { useEffect, useState } from "react";
import { api } from "../api/client";
import styles from "./Equilibrio.module.css";

const fmt = (n) => Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtPct = (n) => Number(n ?? 0).toFixed(1) + "%";
const formatMonth = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });

export default function Equilibrio() {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadBreakeven(periodId) {
    setLoading(true);
    setError("");
    try {
      const url = periodId ? `/dashboard/breakeven?period_id=${periodId}` : "/dashboard/breakeven";
      setResult(await api.get(url));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([api.post("/periods/current", {}), api.get("/periods")])
      .then(([cur, all]) => {
        setPeriods(all);
        setSelectedPeriodId(cur.id);
        loadBreakeven(cur.id);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  function handlePeriodChange(id) {
    setSelectedPeriodId(id);
    loadBreakeven(id);
  }

  if (loading) return <div style={{ padding: 32 }}>Calculando...</div>;

  const r = result;
  const hasFixed = r?.fixed_monthly_cost != null;

  return (
    <div className={styles.container}>
      <h2>Punto de Equilibrio</h2>
      <p className={styles.subtitle}>
        Ingresos mínimos para cubrir todos los costos fijos y variables del período.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      {!hasFixed && (
        <div className={styles.noConfig}>
          El costo fijo mensual no está configurado. Ve a <strong>Configuración</strong> para establecerlo
          y obtener el cálculo del punto de equilibrio.
        </div>
      )}

      <div className={styles.periodSelector}>
        <label style={{ fontSize: 13, fontWeight: 500 }}>Período:</label>
        <select value={selectedPeriodId} onChange={(e) => handlePeriodChange(e.target.value)}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{formatMonth(p.period_month)}</option>
          ))}
        </select>
      </div>

      {r && (
        <div className={styles.grid}>
          {/* Datos de la estructura de costos */}
          <div className={styles.card}>
            <h3>Estructura de Costos</h3>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Costo variable promedio</span>
              <span className={styles.metricValue}>{fmtPct(r.avg_variable_cost_pct)}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Margen de contribución</span>
              <span className={styles.metricValue}>{fmtPct(r.contribution_margin_pct)}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Ticket promedio</span>
              <span className={styles.metricValue}>
                {r.avg_ticket != null ? `$${fmt(r.avg_ticket)}` : "—"}
              </span>
            </div>
            {hasFixed && (
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Costo fijo mensual</span>
                <span className={styles.metricValue}>${fmt(r.fixed_monthly_cost)}</span>
              </div>
            )}
          </div>

          {/* Resultados */}
          <div className={styles.card}>
            <h3>Resultados</h3>
            {hasFixed ? (
              <>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Ventas necesarias para equilibrio</span>
                  <span className={`${styles.metricValueBig} ${styles.metricValueAccent}`}>
                    ${fmt(r.breakeven_revenue)}
                  </span>
                </div>
                {r.breakeven_visits != null && (
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Visitas necesarias (aprox.)</span>
                    <span className={styles.metricValueBig}>
                      {Math.ceil(Number(r.breakeven_visits))}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-light)", marginTop: 8 }}>
                Configura el costo fijo mensual para ver el punto de equilibrio.
              </p>
            )}
          </div>

          {hasFixed && r.breakeven_revenue != null && (
            <div className={styles.highlight}>
              <div className={styles.hlItem}>
                <div className={styles.hlLabel}>Ventas para equilibrio</div>
                <div className={styles.hlValue}>${fmt(r.breakeven_revenue)}</div>
              </div>
              <div className={styles.hlItem}>
                <div className={styles.hlLabel}>Margen de contribución</div>
                <div className={styles.hlValue}>{fmtPct(r.contribution_margin_pct)}</div>
              </div>
              <div className={styles.hlItem}>
                <div className={styles.hlLabel}>Visitas mínimas</div>
                <div className={styles.hlValue}>
                  {r.breakeven_visits != null ? Math.ceil(Number(r.breakeven_visits)) : "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
