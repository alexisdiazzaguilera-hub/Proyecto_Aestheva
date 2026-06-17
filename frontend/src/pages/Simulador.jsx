import { useEffect, useState } from "react";
import { api } from "../api/client";
import styles from "./Simulador.module.css";

const fmt = (n) => Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

export default function Simulador() {
  const [services, setServices] = useState([]);
  const [discounts, setDiscounts] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [payment, setPayment] = useState("efectivo");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/services/catalog").catch((e) => setError(e.message)).then((data) => {
      if (!data) return;
      setServices(data);
      if (data.length > 0) setSelectedId(data[0].id);
    });
  }, []);

  const BANK_RATES = { efectivo: 0, tarjeta: 0.03, msi: 0.09 };

  function calcService(svc, discountPct) {
    const price = Number(svc.sale_price);
    const varCost = Number(svc.variable_cost ?? 0);
    const discounted = price * (1 - discountPct / 100);
    const bankFee = discounted * BANK_RATES[payment];
    const margin = discounted - varCost - bankFee;
    const marginPct = discounted > 0 ? (margin / discounted) * 100 : 0;
    return { price, discounted, varCost, bankFee, margin, marginPct, discountPct };
  }

  const svc = services.find((s) => s.id === selectedId);
  const discPct = Number(discounts[selectedId] ?? 0);
  const calc = svc ? calcService(svc, discPct) : null;

  function marginClass(pct) {
    if (pct >= 30) return styles.badgeGood;
    if (pct >= 10) return styles.badgeWarn;
    return styles.badgeBad;
  }

  return (
    <div className={styles.container}>
      <h2>Simulador de Descuentos</h2>
      <p className={styles.subtitle}>
        Calcula el impacto de un descuento sobre el margen de cada servicio antes de aplicarlo.
      </p>

      {error && <div style={{ background: "#fff0f0", color: "var(--danger)", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className={styles.grid}>
        {/* Configuración */}
        <div className={styles.card}>
          <h3>Parámetros</h3>

          <div className={styles.formGroup}>
            <label>Servicio</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.sku} — {s.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Descuento (%)</label>
            <input
              type="number" min={0} max={100} step={1}
              value={discounts[selectedId] ?? 0}
              onChange={(e) => setDiscounts((prev) => ({ ...prev, [selectedId]: e.target.value }))}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Método de pago</label>
            <select value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="efectivo">Efectivo (sin comisión)</option>
              <option value="tarjeta">Tarjeta (3%)</option>
              <option value="msi">MSI (9%)</option>
            </select>
          </div>
        </div>

        {/* Resultado del cálculo */}
        <div className={styles.card}>
          <h3>Resultado</h3>
          {calc ? (
            <div className={styles.result}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Precio original</span>
                <span className={styles.metricValue}>${fmt(calc.price)}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Precio con descuento</span>
                <span className={`${styles.metricValue} ${styles.metricValueAccent}`}>
                  ${fmt(calc.discounted)}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Costo variable</span>
                <span className={styles.metricValue}>${fmt(calc.varCost)}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Comisión bancaria</span>
                <span className={styles.metricValue}>${fmt(calc.bankFee)}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Margen neto</span>
                <span className={`${styles.metricValue} ${calc.margin >= 0 ? styles.metricValueGood : styles.metricValueDanger}`}>
                  ${fmt(calc.margin)}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>% Margen</span>
                <span className={`${styles.badge} ${marginClass(calc.marginPct)}`}>
                  {calc.marginPct.toFixed(1)}%
                </span>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-light)" }}>
              Selecciona un servicio para ver el cálculo.
            </p>
          )}
        </div>

        {/* Tabla comparativa de todos los servicios */}
        {services.length > 0 && (
          <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
            <h3>Comparativa de todos los servicios</h3>
            <table className={styles.serviceTable}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Servicio</th>
                  <th>Precio</th>
                  <th>Descuento (%)</th>
                  <th>Precio final</th>
                  <th>Margen $</th>
                  <th>Margen %</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => {
                  const d = Number(discounts[s.id] ?? 0);
                  const c = calcService(s, d);
                  return (
                    <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(s.id)}>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.sku}</td>
                      <td>{s.name}</td>
                      <td>${fmt(c.price)}</td>
                      <td>
                        <input
                          className={styles.discountInput}
                          type="number" min={0} max={100} step={1}
                          value={discounts[s.id] ?? 0}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            setDiscounts((prev) => ({ ...prev, [s.id]: e.target.value }));
                          }}
                        />
                      </td>
                      <td>${fmt(c.discounted)}</td>
                      <td style={{ color: c.margin >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                        ${fmt(c.margin)}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${marginClass(c.marginPct)}`}>
                          {c.marginPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
