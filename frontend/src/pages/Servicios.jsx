import { useEffect, useState } from "react";
import { api } from "../api/client";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import styles from "./Servicios.module.css";

const AREAS = ["cosmiatra", "estetico", "nutricion"];
const AREA_LABELS = { cosmiatra: "Cosmiatra", estetico: "Estético", nutricion: "Nutrición" };
const EMPTY_FORM = { name: "", area: "cosmiatra", sale_price: "", duration_min: "60", variable_cost: "0", equipment_id: "" };

export default function Servicios({ user }) {
  const isAdmin = user?.role === "administrador";
  const [services, setServices] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [recipeModal, setRecipeModal] = useState(null);
  const [equipModal, setEquipModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [equipForm, setEquipForm] = useState({ name: "", acquisition_cost: "", useful_life_months: "24", monthly_sessions_default: "30" });
  const [savingEquip, setSavingEquip] = useState(false);

  async function load() {
    try {
      const [svcs, eqs] = await Promise.all([
        api.get("/services/catalog"),
        isAdmin ? api.get("/equipment/") : Promise.resolve([]),
      ]);
      setServices(svcs);
      setEquipment(eqs);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setForm(EMPTY_FORM); setModal("create"); }
  function openEdit(s) {
    setForm({ name: s.name, area: s.area, sale_price: s.sale_price, duration_min: s.duration_min, variable_cost: s.variable_cost, equipment_id: s.equipment_id ?? "" });
    setModal(s);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = { ...form, sale_price: Number(form.sale_price), duration_min: Number(form.duration_min), variable_cost: Number(form.variable_cost), equipment_id: form.equipment_id || null };
      if (modal === "create") { await api.post("/services/", body); }
      else { await api.put(`/services/${modal.id}`, body); }
      setModal(null);
      load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const f = (v) => setForm((prev) => ({ ...prev, ...v }));

  async function handleSaveEquip(e) {
    e.preventDefault();
    setSavingEquip(true);
    try {
      const body = { name: equipForm.name, acquisition_cost: Number(equipForm.acquisition_cost), useful_life_months: Number(equipForm.useful_life_months), monthly_sessions_default: Number(equipForm.monthly_sessions_default) };
      const created = await api.post("/equipment/", body);
      setEquipment((prev) => [...prev, created]);
      f({ equipment_id: created.id });
      setEquipModal(false);
      setEquipForm({ name: "", acquisition_cost: "", useful_life_months: "24", monthly_sessions_default: "30" });
    } catch (e) { alert(e.message); }
    finally { setSavingEquip(false); }
  }

  if (loading) return <div className="spinner" />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Catálogo de Servicios</h2>
        {isAdmin && <button className="btn-primary" onClick={openCreate}>+ Nuevo Servicio</button>}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>SKU</th><th>Servicio</th><th>Área</th><th>Duración</th>
              {isAdmin && <><th>Precio</th><th>Costo Receta</th><th>Margen</th><th></th></>}
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr><td colSpan={isAdmin ? 8 : 4} style={{ textAlign: "center", color: "var(--text-light)", padding: 32 }}>Sin servicios. Crea el primero.</td></tr>
            )}
            {services.map((s) => {
              const margin = isAdmin ? ((Number(s.sale_price) - Number(s.recipe_cost_total)) / Number(s.sale_price) * 100) : null;
              const marginClass = margin >= 30 ? styles.good : margin >= 10 ? styles.warn : styles.bad;
              return (
                <tr key={s.id}>
                  <td className={styles.sku}>{s.sku}</td>
                  <td className={styles.name}>{s.name}</td>
                  <td><span className={`badge-area badge-${s.area}`}>{AREA_LABELS[s.area]}</span></td>
                  <td>{s.duration_min} min</td>
                  {isAdmin && (
                    <>
                      <td className={styles.money}>${Number(s.sale_price).toLocaleString("es-MX")}</td>
                      <td className={styles.money}>${Number(s.recipe_cost_total ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td><span className={`${styles.margin} ${marginClass}`}>{margin?.toFixed(1)}%</span></td>
                      <td className={styles.actions}>
                        <button className={styles.editBtn} onClick={() => openEdit(s)}>Editar</button>
                        <button className={styles.recipeBtn} onClick={() => setRecipeModal(s)}>Receta</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === "create" ? "Nuevo Servicio" : "Editar Servicio"} onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FormField label="Nombre del servicio"><input value={form.name} onChange={(e) => f({ name: e.target.value })} required /></FormField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Área">
                  <select value={form.area} onChange={(e) => f({ area: e.target.value })}>
                    {AREAS.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
                  </select>
                </FormField>
                <FormField label="Duración (min)"><input type="number" min="1" value={form.duration_min} onChange={(e) => f({ duration_min: e.target.value })} required /></FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Precio de venta ($)"><input type="number" step="0.01" min="0" value={form.sale_price} onChange={(e) => f({ sale_price: e.target.value })} required /></FormField>
                <FormField label="Costo variable adicional ($)" hint="Materiales desechables, guantes, etc."><input type="number" step="0.01" min="0" value={form.variable_cost} onChange={(e) => f({ variable_cost: e.target.value })} /></FormField>
              </div>
              <FormField label="Equipo (opcional)">
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={form.equipment_id} onChange={(e) => f({ equipment_id: e.target.value })} style={{ flex: 1 }}>
                    <option value="">Sin equipo</option>
                    {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setEquipModal(true)} title="Agregar nuevo equipo" style={{ padding: "0 14px", background: "var(--cream-dark)", border: "1px solid var(--gold-light)", borderRadius: "var(--radius-sm)", color: "var(--gold-dark)", fontWeight: 600, fontSize: 18 }}>+</button>
                </div>
              </FormField>
              {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {recipeModal && (
        <RecipeModal service={recipeModal} onClose={() => { setRecipeModal(null); load(); }} />
      )}

      {equipModal && (
        <Modal title="Nuevo Equipo" onClose={() => setEquipModal(false)}>
          <form onSubmit={handleSaveEquip}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FormField label="Nombre del equipo"><input value={equipForm.name} onChange={(e) => setEquipForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Hydrafacial, Radiofrecuencia..." required /></FormField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Costo de adquisición ($)" hint="Para calcular depreciación"><input type="number" step="0.01" min="0" value={equipForm.acquisition_cost} onChange={(e) => setEquipForm((p) => ({ ...p, acquisition_cost: e.target.value }))} /></FormField>
                <FormField label="Vida útil (meses)"><input type="number" min="1" value={equipForm.useful_life_months} onChange={(e) => setEquipForm((p) => ({ ...p, useful_life_months: e.target.value }))} /></FormField>
              </div>
              <FormField label="Sesiones promedio por mes" hint="Para calcular costo por sesión"><input type="number" min="1" value={equipForm.monthly_sessions_default} onChange={(e) => setEquipForm((p) => ({ ...p, monthly_sessions_default: e.target.value }))} /></FormField>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={() => setEquipModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={savingEquip}>{savingEquip ? "Guardando..." : "Agregar Equipo"}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function RecipeModal({ service, onClose }) {
  const [lines, setLines] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState("1");

  useEffect(() => {
    Promise.all([
      api.get(`/services/${service.id}/recipe/`),
      api.get("/products/"),
    ]).then(([recipe, prods]) => {
      setLines(recipe);
      setProducts(prods);
    }).finally(() => setLoading(false));
  }, [service.id]);

  function addLine() {
    if (!addProductId) return;
    const existing = lines.find((l) => l.product_id === addProductId);
    if (existing) return;
    const prod = products.find((p) => p.id === addProductId);
    const costApp = prod.yield_per_unit > 1 ? Number(prod.unit_cost) / prod.yield_per_unit : Number(prod.unit_cost);
    setLines((prev) => [...prev, { product_id: prod.id, product_name: prod.name, quantity: Number(addQty), unit_of_measure: prod.unit_of_measure, unit_cost: Number(prod.unit_cost), yield_per_unit: prod.yield_per_unit, cost_per_application: costApp, line_cost: costApp * Number(addQty) }]);
    setAddProductId("");
    setAddQty("1");
  }

  function updateQty(idx, qty) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const lineC = l.cost_per_application * Number(qty);
      return { ...l, quantity: Number(qty), line_cost: lineC };
    }));
  }

  function removeLine(idx) { setLines((prev) => prev.filter((_, i) => i !== idx)); }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/services/${service.id}/recipe/`, { lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })) });
      onClose();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  const total = lines.reduce((s, l) => s + Number(l.line_cost), 0);
  const availableProducts = products.filter((p) => !lines.find((l) => l.product_id === p.id));

  return (
    <Modal title={`Receta — ${service.name}`} onClose={onClose}>
      {loading ? <div className="spinner" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {lines.length === 0 && <p style={{ color: "var(--text-light)", fontSize: 13 }}>Sin ingredientes aún.</p>}
          {lines.map((l, i) => (
            <div key={l.product_id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 28px", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>{l.product_name} <span style={{ color: "var(--text-light)", fontSize: 11 }}>({l.unit_of_measure})</span></span>
              <input type="number" step="0.01" min="0.01" value={l.quantity} onChange={(e) => updateQty(i, e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--gold-light)", borderRadius: 6, fontSize: 13 }} />
              <span style={{ fontSize: 12, color: "var(--text-light)", textAlign: "right" }}>${Number(l.line_cost).toFixed(2)}</span>
              <button onClick={() => removeLine(i)} style={{ background: "none", color: "var(--text-light)", fontSize: 16 }}>✕</button>
            </div>
          ))}

          <div style={{ borderTop: "1px solid var(--cream-dark)", paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <select value={addProductId} onChange={(e) => setAddProductId(e.target.value)} style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--gold-light)", borderRadius: 6, fontSize: 13 }}>
              <option value="">Agregar producto...</option>
              {availableProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" step="0.01" min="0.01" value={addQty} onChange={(e) => setAddQty(e.target.value)} style={{ width: 70, padding: "7px 8px", border: "1px solid var(--gold-light)", borderRadius: 6, fontSize: 13 }} />
            <button className="btn-secondary" onClick={addLine} style={{ padding: "7px 14px" }}>Agregar</button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 15 }}>Costo total receta: ${total.toFixed(2)}</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" onClick={onClose}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar Receta"}</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
