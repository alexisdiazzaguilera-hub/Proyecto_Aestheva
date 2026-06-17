import { useEffect, useState } from "react";
import { api } from "../api/client";
import ExportButton from "../components/ExportButton";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import styles from "./Ventas.module.css";

const PAYMENT_LABELS = { efectivo: "Efectivo", tarjeta: "Tarjeta", msi: "3 MSI" };

export default function Ventas({ user }) {
  const isAdmin = user?.role === "administrador";

  const [periods, setPeriods] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [sales, setSales] = useState([]);
  const [services, setServices] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    service_id: "", client_name: "", staff_id: "",
    sale_price: "", payment_method: "efectivo",
    promo_tag: "", supply_cost_est: "0",
    sale_date: new Date().toISOString().slice(0, 10), notes: "",
  });

  async function loadPeriods() {
    const [cur, all] = await Promise.all([
      api.post("/periods/current", {}),
      api.get("/periods"),
    ]);
    setCurrentPeriod(cur);
    setPeriods(all);
    return cur;
  }

  async function loadSales(periodId) {
    const data = await api.get(`/sales?period_id=${periodId}`);
    setSales(data);
  }

  async function loadCatalog() {
    const [svcs, staff] = await Promise.all([
      api.get("/services/catalog"),
      api.get("/staff/").catch(() => []),
    ]);
    setServices(svcs);
    setStaffList(staff);
  }

  useEffect(() => {
    Promise.all([loadPeriods(), loadCatalog()])
      .then(([cur]) => loadSales(cur.id))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handlePeriodChange(periodId) {
    setLoading(true);
    const p = periods.find((p) => p.id === periodId);
    setCurrentPeriod(p);
    await loadSales(periodId);
    setLoading(false);
  }

  function openModal() {
    setForm({
      service_id: services[0]?.id ?? "", client_name: "", staff_id: "",
      sale_price: "", payment_method: "efectivo",
      promo_tag: "", supply_cost_est: "0",
      sale_date: new Date().toISOString().slice(0, 10), notes: "",
    });
    setError("");
    setModal(true);
  }

  function handleServiceChange(id) {
    const svc = services.find((s) => s.id === id);
    setForm((p) => ({ ...p, service_id: id, sale_price: svc?.sale_price ?? "" }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = {
        service_id: form.service_id,
        client_name: form.client_name,
        staff_id: form.staff_id || null,
        sale_price: Number(form.sale_price),
        payment_method: form.payment_method,
        promo_tag: form.promo_tag || null,
        supply_cost_est: Number(form.supply_cost_est),
        sale_date: form.sale_date || null,
        notes: form.notes || null,
      };
      await api.post("/sales", body);
      setModal(false);
      await loadSales(currentPeriod.id);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar esta venta?")) return;
    await api.delete(`/sales/${id}`);
    await loadSales(currentPeriod.id);
  }

  const f = (v) => setForm((p) => ({ ...p, ...v }));

  // KPIs
  const totalVentas = sales.reduce((s, v) => s + Number(v.sale_price), 0);
  const totalMargen = isAdmin ? sales.reduce((s, v) => s + Number(v.margin ?? 0), 0) : null;
  const margenPct = totalVentas > 0 && totalMargen !== null ? (totalMargen / totalVentas * 100) : null;

  const formatMonth = (d) => {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>Ventas del Mes</h2>
          <select
            className={styles.periodSelect}
            value={currentPeriod?.id ?? ""}
            onChange={(e) => handlePeriodChange(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{formatMonth(p.period_month)}{p.is_closed ? " (cerrado)" : ""}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {user?.role === "administrador" && currentPeriod && (
            <>
              <ExportButton endpoint={`/exports/sales?period_id=${currentPeriod.id}`} filename="ventas" format="csv" label="CSV ventas" />
              <ExportButton endpoint={`/exports/marketing?period_id=${currentPeriod.id}`} filename="marketing" format="csv" label="CSV marketing" />
            </>
          )}
          {!currentPeriod?.is_closed && (
            <button className="btn-primary" onClick={openModal}>+ Registrar Visita</button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Total Ventas</span>
          <span className={styles.kpiValue}>${totalVentas.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Visitas</span>
          <span className={styles.kpiValue}>{sales.length}</span>
        </div>
        {isAdmin && (
          <>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Margen Bruto</span>
              <span className={styles.kpiValue}>${totalMargen?.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>% Margen</span>
              <span className={`${styles.kpiValue} ${margenPct >= 30 ? styles.good : margenPct >= 10 ? styles.warn : styles.bad}`}>
                {margenPct?.toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Servicio</th>
              <th>Cliente</th>
              <th>Profesional</th>
              <th>Pago</th>
              <th>Precio</th>
              {isAdmin && <><th>Insumo</th><th>Comisión banco</th><th>Margen</th></>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 && (
              <tr><td colSpan={isAdmin ? 10 : 7} style={{ textAlign: "center", color: "var(--text-light)", padding: 32 }}>
                Sin visitas registradas. Usa "+ Registrar Visita" para empezar.
              </td></tr>
            )}
            {sales.map((s) => (
              <tr key={s.id}>
                <td className={styles.date}>{s.sale_date ?? "—"}</td>
                <td className={styles.service}>{s.service_name_snapshot}{s.promo_tag && <span className={styles.promo}>{s.promo_tag}</span>}</td>
                <td>{s.client_name ?? "—"}</td>
                <td>{s.staff_name ?? "—"}</td>
                <td><span className={styles.payment}>{PAYMENT_LABELS[s.payment_method]}</span></td>
                <td className={styles.money}>${Number(s.sale_price).toLocaleString("es-MX")}</td>
                {isAdmin && (
                  <>
                    <td className={styles.cost}>${Number(s.supply_cost_est).toFixed(2)}</td>
                    <td className={styles.cost}>${Number(s.bank_fee).toFixed(2)}</td>
                    <td>
                      <span className={`${styles.margin} ${Number(s.margin_pct) >= 30 ? styles.good : Number(s.margin_pct) >= 10 ? styles.warn : styles.bad}`}>
                        {Number(s.margin_pct).toFixed(1)}%
                      </span>
                    </td>
                  </>
                )}
                <td>
                  <button className={styles.delBtn} onClick={() => handleDelete(s.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="Registrar Visita" onClose={() => setModal(false)}>
          <form onSubmit={handleSave}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FormField label="Servicio">
                <select value={form.service_id} onChange={(e) => handleServiceChange(e.target.value)} required>
                  <option value="">Seleccionar...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.sku} — {s.name}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Nombre del cliente">
                <input value={form.client_name} onChange={(e) => f({ client_name: e.target.value })} placeholder="Nombre completo" required />
              </FormField>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Profesional">
                  <select value={form.staff_id} onChange={(e) => f({ staff_id: e.target.value })}>
                    <option value="">Sin asignar</option>
                    {staffList.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Fecha">
                  <input type="date" value={form.sale_date} onChange={(e) => f({ sale_date: e.target.value })} />
                </FormField>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Precio cobrado ($)">
                  <input type="number" step="0.01" min="0" value={form.sale_price} onChange={(e) => f({ sale_price: e.target.value })} required />
                </FormField>
                <FormField label="Método de pago">
                  <select value={form.payment_method} onChange={(e) => f({ payment_method: e.target.value })}>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="msi">3 MSI</option>
                  </select>
                </FormField>
              </div>

              {isAdmin && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FormField label="Costo insumos estimado ($)">
                    <input type="number" step="0.01" min="0" value={form.supply_cost_est} onChange={(e) => f({ supply_cost_est: e.target.value })} />
                  </FormField>
                  <FormField label="Promo / etiqueta">
                    <input value={form.promo_tag} onChange={(e) => f({ promo_tag: e.target.value })} placeholder="Ej: Paquete, Cortesía..." />
                  </FormField>
                </div>
              )}

              <FormField label="Notas (opcional)">
                <input value={form.notes} onChange={(e) => f({ notes: e.target.value })} />
              </FormField>

              {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Guardando..." : "Registrar Visita"}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
