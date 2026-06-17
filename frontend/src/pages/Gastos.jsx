import { useEffect, useState } from "react";
import { api } from "../api/client";
import ExportButton from "../components/ExportButton";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import styles from "./Gastos.module.css";

const CATEGORIAS = ["renta","nomina","marketing","prestamo","insumos","contabilidad","equipo","servicios","otros"];
const CAT_LABELS = { renta:"Renta", nomina:"Nómina", marketing:"Marketing", prestamo:"Préstamo", insumos:"Insumos", contabilidad:"Contabilidad", equipo:"Equipo", servicios:"Servicios", otros:"Otros" };
const CAT_FIXED = ["renta","nomina","prestamo","contabilidad"];

const EMPTY_FORM = { concept: "", category: "renta", amount: "", expense_date: new Date().toISOString().slice(0,10) };

export default function Gastos() {
  const [periods, setPeriods] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadExpenses(periodId) {
    const data = await api.get(`/expenses/?period_id=${periodId}`);
    setExpenses(data);
  }

  useEffect(() => {
    Promise.all([api.post("/periods/current", {}), api.get("/periods")])
      .then(([cur, all]) => {
        setCurrentPeriod(cur);
        setPeriods(all);
        return loadExpenses(cur.id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handlePeriodChange(id) {
    setLoading(true);
    const p = periods.find((p) => p.id === id);
    setCurrentPeriod(p);
    await loadExpenses(id);
    setLoading(false);
  }

  function openCreate() { setForm({ ...EMPTY_FORM, expense_date: new Date().toISOString().slice(0,10) }); setError(""); setModal("create"); }
  function openEdit(e) { setForm({ concept: e.concept, category: e.category, amount: e.amount, expense_date: e.expense_date }); setError(""); setModal(e); }

  async function handleSave(ev) {
    ev.preventDefault(); setSaving(true); setError("");
    try {
      const body = { ...form, amount: Number(form.amount), period_id: currentPeriod.id };
      if (modal === "create") await api.post("/expenses/", body);
      else await api.put(`/expenses/${modal.id}`, { concept: form.concept, category: form.category, amount: Number(form.amount), expense_date: form.expense_date });
      setModal(null);
      await loadExpenses(currentPeriod.id);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este gasto?")) return;
    await api.delete(`/expenses/${id}`);
    await loadExpenses(currentPeriod.id);
  }

  const f = (v) => setForm((p) => ({ ...p, ...v }));
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const fixed = expenses.filter((e) => CAT_FIXED.includes(e.category)).reduce((s, e) => s + Number(e.amount), 0);
  const variable = total - fixed;
  const formatMonth = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  if (loading) return <div className="spinner" />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>Gastos del Mes</h2>
          <select className={styles.periodSelect} value={currentPeriod?.id ?? ""} onChange={(e) => handlePeriodChange(e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{formatMonth(p.period_month)}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {currentPeriod && (
            <ExportButton
              endpoint={`/exports/expenses?period_id=${currentPeriod.id}`}
              filename="gastos"
              format="csv"
              label="Exportar CSV"
            />
          )}
          {!currentPeriod?.is_closed && <button className="btn-primary" onClick={openCreate}>+ Agregar Gasto</button>}
        </div>
      </div>

      <div className={styles.kpis}>
        {[
          { label: "Total Gastos", value: total },
          { label: "Gastos Fijos", value: fixed },
          { label: "Gastos Variables", value: variable },
        ].map((k) => (
          <div key={k.label} className={styles.kpi}>
            <span className={styles.kpiLabel}>{k.label}</span>
            <span className={styles.kpiValue}>${Number(k.value).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Tipo</th><th>Monto</th><th></th></tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign:"center", color:"var(--text-light)", padding:32 }}>Sin gastos registrados.</td></tr>
            )}
            {expenses.map((e) => (
              <tr key={e.id}>
                <td className={styles.date}>{e.expense_date}</td>
                <td className={styles.concept}>{e.concept}</td>
                <td><span className={styles.cat}>{CAT_LABELS[e.category]}</span></td>
                <td><span className={CAT_FIXED.includes(e.category) ? styles.fixed : styles.variable}>{CAT_FIXED.includes(e.category) ? "Fijo" : "Variable"}</span></td>
                <td className={styles.amount}>${Number(e.amount).toLocaleString("es-MX", { minimumFractionDigits:2 })}</td>
                <td className={styles.actions}>
                  <button className={styles.editBtn} onClick={() => openEdit(e)}>Editar</button>
                  <button className={styles.delBtn} onClick={() => handleDelete(e.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === "create" ? "Nuevo Gasto" : "Editar Gasto"} onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <FormField label="Concepto"><input value={form.concept} onChange={(e) => f({ concept: e.target.value })} placeholder="Ej: Renta mes de junio" required /></FormField>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <FormField label="Categoría">
                  <select value={form.category} onChange={(e) => f({ category: e.target.value })}>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                  </select>
                </FormField>
                <FormField label="Fecha"><input type="date" value={form.expense_date} onChange={(e) => f({ expense_date: e.target.value })} required /></FormField>
              </div>
              <FormField label="Monto ($)"><input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => f({ amount: e.target.value })} required /></FormField>
              {error && <p style={{ color:"var(--danger)", fontSize:13 }}>{error}</p>}
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
