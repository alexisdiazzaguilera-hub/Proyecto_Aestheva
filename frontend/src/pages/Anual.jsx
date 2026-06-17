import { useEffect, useState } from "react";
import { api } from "../api/client";
import styles from "./Anual.module.css";

const fmt = (n) => Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

export default function Anual() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/dashboard/annual")
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totals = rows.reduce((acc, r) => ({
    total_sales: acc.total_sales + Number(r.total_sales),
    total_expenses: acc.total_expenses + Number(r.total_expenses),
    gross_margin: acc.gross_margin + Number(r.gross_margin),
    net_result: acc.net_result + Number(r.net_result),
    visit_count: acc.visit_count + r.visit_count,
  }), { total_sales: 0, total_expenses: 0, gross_margin: 0, net_result: 0, visit_count: 0 });

  const formatMonth = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  if (loading) return <div className="spinner" />;

  return (
    <div className={styles.container}>
      <h2>Análisis Anual</h2>

      {error && <p className={styles.error}>{error}</p>}

      {rows.length === 0 && !error && (
        <div className={styles.empty}>Aún no hay períodos registrados.</div>
      )}

      {rows.length > 0 && (
        <>
          {/* Resumen acumulado */}
          <div className={styles.summary}>
            {[
              { label: "Ventas Acumuladas", value: totals.total_sales },
              { label: "Gastos Acumulados", value: totals.total_expenses },
              { label: "Margen Bruto Acumulado", value: totals.gross_margin },
              { label: "Resultado Neto Acumulado", value: totals.net_result, highlight: true },
            ].map((k) => (
              <div key={k.label} className={`${styles.summaryCard} ${k.highlight ? (totals.net_result >= 0 ? styles.positive : styles.negative) : ""}`}>
                <span className={styles.summaryLabel}>{k.label}</span>
                <span className={styles.summaryValue}>${fmt(k.value)}</span>
              </div>
            ))}
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Visitas</th>
                  <th>Ventas</th>
                  <th>Gastos</th>
                  <th>Margen Bruto</th>
                  <th>Resultado</th>
                  <th>% Margen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = Number(r.total_sales) > 0 ? (Number(r.gross_margin) / Number(r.total_sales) * 100) : 0;
                  const netPositive = Number(r.net_result) >= 0;
                  return (
                    <tr key={r.period_month}>
                      <td className={styles.month}>{formatMonth(r.period_month)}</td>
                      <td className={styles.center}>{r.visit_count}</td>
                      <td className={styles.money}>${fmt(r.total_sales)}</td>
                      <td className={styles.money}>${fmt(r.total_expenses)}</td>
                      <td className={styles.money}>${fmt(r.gross_margin)}</td>
                      <td className={netPositive ? styles.positive : styles.negative}>${fmt(r.net_result)}</td>
                      <td>
                        <span className={`${styles.pct} ${pct >= 30 ? styles.good : pct >= 10 ? styles.warn : styles.bad}`}>
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={styles.totalsRow}>
                  <td><strong>TOTAL</strong></td>
                  <td className={styles.center}><strong>{totals.visit_count}</strong></td>
                  <td className={styles.money}><strong>${fmt(totals.total_sales)}</strong></td>
                  <td className={styles.money}><strong>${fmt(totals.total_expenses)}</strong></td>
                  <td className={styles.money}><strong>${fmt(totals.gross_margin)}</strong></td>
                  <td className={totals.net_result >= 0 ? styles.positive : styles.negative}><strong>${fmt(totals.net_result)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
