import { useEffect, useState } from "react";
import { api } from "../api/client";
import styles from "./Dashboard.module.css";

const fmt = (n) => Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtPct = (n) => Number(n ?? 0).toFixed(1) + "%";
const AREA_LABELS = { cosmiatra: "Cosmiatra", estetico: "Estético", nutricion: "Nutrición" };

export default function Dashboard() {
  const [periods, setPeriods] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [staffPerf, setStaffPerf] = useState([]);
  const [areaPerf, setAreaPerf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData(periodId) {
    setLoading(true);
    try {
      const [sum, alr, staff, area] = await Promise.all([
        api.get(`/dashboard/summary?period_id=${periodId}`),
        api.get("/dashboard/stock-alerts"),
        api.get(`/dashboard/staff-performance?period_id=${periodId}`),
        api.get(`/dashboard/area-performance?period_id=${periodId}`),
      ]);
      setSummary(sum);
      setAlerts(alr);
      setStaffPerf(staff);
      setAreaPerf(area);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([
      api.post("/periods/current", {}),
      api.get("/periods"),
    ]).then(([cur, all]) => {
      setCurrentPeriod(cur);
      setPeriods(all);
      loadData(cur.id);
    }).catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  async function handlePeriodChange(id) {
    const p = periods.find((p) => p.id === id);
    setCurrentPeriod(p);
    await loadData(id);
  }

  const formatMonth = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  const netClass = summary && Number(summary.net_result) >= 0 ? styles.positive : styles.negative;
  const marginClass = summary && Number(summary.gross_margin_pct) >= 30 ? styles.positive : Number(summary?.gross_margin_pct) >= 10 ? styles.warning : styles.negative;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Resumen General</h2>
        <select className={styles.periodSelect} value={currentPeriod?.id ?? ""} onChange={(e) => handlePeriodChange(e.target.value)}>
          {periods.map((p) => <option key={p.id} value={p.id}>{formatMonth(p.period_month)}</option>)}
        </select>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading && <div className="spinner" />}

      {!loading && summary && (
        <>
          {/* KPI grid */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Ventas del Mes</span>
              <span className={styles.kpiValue}>${fmt(summary.total_sales)}</span>
              <span className={styles.kpiSub}>{summary.visit_count} visitas · ticket promedio ${fmt(summary.avg_ticket)}</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Margen Bruto</span>
              <span className={`${styles.kpiValue} ${marginClass}`}>${fmt(summary.gross_margin)}</span>
              <span className={styles.kpiSub}>{fmtPct(summary.gross_margin_pct)} sobre ventas</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Gastos del Mes</span>
              <span className={styles.kpiValue}>${fmt(summary.total_expenses)}</span>
              {summary.fixed_cost_budget && (
                <span className={styles.kpiSub}>Presupuesto: ${fmt(summary.fixed_cost_budget)}</span>
              )}
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Resultado Neto</span>
              <span className={`${styles.kpiValue} ${netClass}`}>${fmt(summary.net_result)}</span>
              {summary.fixed_cost_budget && (
                <span className={`${styles.kpiSub} ${Number(summary.deficit_vs_budget) >= 0 ? styles.positive : styles.negative}`}>
                  {Number(summary.deficit_vs_budget) >= 0 ? "+" : ""}${fmt(summary.deficit_vs_budget)} vs presupuesto
                </span>
              )}
            </div>
          </div>

          {/* Desglose de costos */}
          <div className={styles.section}>
            <h3>Desglose de Costos Variables</h3>
            <div className={styles.breakdown}>
              {[
                { label: "Insumos / materiales", value: summary.total_supply_costs },
                { label: "Comisiones bancarias", value: summary.total_bank_fees },
                { label: "Total costos variables", value: Number(summary.total_supply_costs) + Number(summary.total_bank_fees), bold: true },
              ].map((r) => (
                <div key={r.label} className={`${styles.breakdownRow} ${r.bold ? styles.total : ""}`}>
                  <span>{r.label}</span>
                  <span>${fmt(r.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rendimiento por Profesional */}
          <div className={styles.section}>
            <h3>Rendimiento por Profesional</h3>
            {staffPerf.length === 0 ? (
              <p className={styles.emptyState}>Sin citas completadas con profesional asignado en este período.</p>
            ) : (
              <table className={styles.staffTable}>
                <thead>
                  <tr>
                    <th>Profesional</th>
                    <th style={{ textAlign: "right" }}>Servicios</th>
                    <th style={{ textAlign: "right" }}>Ingresos</th>
                    <th style={{ textAlign: "right" }}>Comisión</th>
                    <th style={{ textAlign: "right" }}>Margen Neto</th>
                    <th style={{ textAlign: "right" }}>% Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {staffPerf.map((row, i) => {
                    const rankClass = i === 0 ? styles.rank1 : i === 1 ? styles.rank2 : i === 2 ? styles.rank3 : null;
                    const netClass = Number(row.net_margin_pct) >= 30 ? styles.positive : Number(row.net_margin_pct) >= 10 ? styles.warning : styles.negative;
                    return (
                      <tr key={row.staff_id}>
                        <td>
                          {rankClass && <span className={`${styles.rankBadge} ${rankClass}`}>{i + 1}</span>}
                          <span className={styles.staffName}>{row.staff_name}</span>
                          <span className={styles.staffCount}> · {row.service_count} servicio{row.service_count !== 1 ? "s" : ""}</span>
                        </td>
                        <td className={styles.staffCount} style={{ textAlign: "right" }}>{row.service_count}</td>
                        <td className={styles.moneyCell}>${fmt(row.total_revenue)}</td>
                        <td className={styles.commCell}>${fmt(row.total_commission)}</td>
                        <td className={`${styles.netCell} ${netClass}`}>${fmt(row.net_margin)}</td>
                        <td className={`${styles.moneyCell} ${netClass}`}>{fmtPct(row.net_margin_pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Ingresos por Área */}
          <div className={styles.section}>
            <h3>Ingresos por Área</h3>
            {areaPerf.length === 0 ? (
              <p className={styles.emptyState}>Sin datos de área en este período.</p>
            ) : (
              <div className={styles.areaGrid}>
                {areaPerf.map(row => (
                  <div key={row.area} className={`${styles.areaCard} ${styles[`area-${row.area}`]}`}>
                    <p className={styles.areaLabel} style={{ color: row.area === "cosmiatra" ? "#6b3fa0" : row.area === "estetico" ? "#a03030" : "#2e7d46" }}>
                      {AREA_LABELS[row.area] ?? row.area}
                    </p>
                    <p className={styles.areaRevenue}>${fmt(row.total_revenue)}</p>
                    <div className={styles.areaBar}>
                      <div className={styles.areaBarFill} style={{ width: `${row.revenue_pct}%` }} />
                    </div>
                    <p className={styles.areaPct}>{fmtPct(row.revenue_pct)} del total · {row.service_count} servicios</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alertas de stock */}
          {alerts.length > 0 && (
            <div className={styles.section}>
              <h3>⚠ Alertas de Stock</h3>
              <div className={styles.alertList}>
                {alerts.map((a) => (
                  <div key={a.id} className={styles.alertRow}>
                    <span className={styles.alertName}>{a.name}</span>
                    <span className={styles.alertStock}>
                      {Number(a.stock_quantity) === 0 ? "SIN STOCK" : `${Number(a.stock_quantity)} (mín. ${Number(a.stock_min)})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.fixed_cost_budget == null && (
            <div className={styles.configHint}>
              💡 Configura el costo fijo mensual en <strong>Configuración</strong> para ver el análisis de punto de equilibrio.
            </div>
          )}
        </>
      )}
    </div>
  );
}
