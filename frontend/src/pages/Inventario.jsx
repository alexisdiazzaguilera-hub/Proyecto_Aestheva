import { useEffect, useState } from "react";
import { api } from "../api/client";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import styles from "./Inventario.module.css";

const CATEGORIAS = ["cosmetico", "mestetica", "farmaco", "suplemento", "desechable", "reventa"];
const UNIDADES = ["pieza", "ml", "g", "ampolleta", "caja", "frasco", "jeringa", "par"];
const CAT_LABELS = { cosmetico: "Cosmético", mestetica: "Med. Estética", farmaco: "Fármaco", suplemento: "Suplemento", desechable: "Desechable", reventa: "Reventa" };

const EMPTY_FORM = { name: "", category: "cosmetico", unit_cost: "", sale_price: "", unit_of_measure: "pieza", stock_quantity: "0", stock_min: "0", yield_per_unit: "1", notes: "" };

export default function Inventario() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "create" | product object
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterStock, setFilterStock] = useState("");

  async function load() {
    try {
      const data = await api.get("/products/");
      setProducts(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setModal("create");
  }

  function openEdit(p) {
    setForm({ name: p.name, category: p.category, unit_cost: p.unit_cost, sale_price: p.sale_price, unit_of_measure: p.unit_of_measure, stock_quantity: p.stock_quantity, stock_min: p.stock_min, yield_per_unit: p.yield_per_unit, notes: p.notes ?? "" });
    setModal(p);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, unit_cost: Number(form.unit_cost), sale_price: Number(form.sale_price), stock_quantity: Number(form.stock_quantity), stock_min: Number(form.stock_min), yield_per_unit: Number(form.yield_per_unit) };
      if (modal === "create") {
        await api.post("/products/", body);
      } else {
        await api.put(`/products/${modal.id}`, body);
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm("¿Desactivar este producto?")) return;
    await api.delete(`/products/${id}`);
    load();
  }

  const f = (v) => setForm((prev) => ({ ...prev, ...v }));

  const filtered = products.filter((p) => {
    if (filterCat && p.category !== filterCat) return false;
    if (filterStock === "low" && Number(p.stock_quantity) > Number(p.stock_min)) return false;
    if (filterStock === "out" && Number(p.stock_quantity) > 0) return false;
    return true;
  });

  if (loading) return <div className="spinner" />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Inventario de Productos</h2>
        <button className="btn-primary" onClick={openCreate}>+ Nuevo Producto</button>
      </div>

      <div className={styles.filters}>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
        </select>
        <select value={filterStock} onChange={(e) => setFilterStock(e.target.value)}>
          <option value="">Todo el stock</option>
          <option value="low">Stock bajo</option>
          <option value="out">Sin stock</option>
        </select>
        <span className={styles.count}>{filtered.length} productos</span>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Costo Unitario</th>
              <th>Rendimiento</th>
              <th>Costo/Aplic.</th>
              <th>Stock</th>
              <th>Unidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-light)", padding: 32 }}>Sin productos. Crea el primero.</td></tr>
            )}
            {filtered.map((p) => {
              const costApp = p.yield_per_unit > 1 ? Number(p.unit_cost) / p.yield_per_unit : Number(p.unit_cost);
              const stockLow = Number(p.stock_quantity) <= Number(p.stock_min);
              return (
                <tr key={p.id}>
                  <td className={styles.name}>{p.name}</td>
                  <td><span className={styles.cat}>{CAT_LABELS[p.category] ?? p.category}</span></td>
                  <td className={styles.money}>${Number(p.unit_cost).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  <td className={styles.center}>{p.yield_per_unit}x</td>
                  <td className={styles.money}>${costApp.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  <td className={stockLow ? styles.stockLow : styles.stock}>{Number(p.stock_quantity)} {p.unit_of_measure}</td>
                  <td className={styles.center}>{p.unit_of_measure}</td>
                  <td className={styles.actions}>
                    <button className={styles.editBtn} onClick={() => openEdit(p)}>Editar</button>
                    <button className={styles.delBtn} onClick={() => handleDeactivate(p.id)}>Desactivar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === "create" ? "Nuevo Producto" : "Editar Producto"} onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FormField label="Nombre"><input value={form.name} onChange={(e) => f({ name: e.target.value })} required /></FormField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Categoría">
                  <select value={form.category} onChange={(e) => f({ category: e.target.value })}>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                  </select>
                </FormField>
                <FormField label="Unidad">
                  <select value={form.unit_of_measure} onChange={(e) => f({ unit_of_measure: e.target.value })}>
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Costo Unitario ($)"><input type="number" step="0.01" min="0" value={form.unit_cost} onChange={(e) => f({ unit_cost: e.target.value })} required /></FormField>
                <FormField label="Precio de Venta ($)"><input type="number" step="0.01" min="0" value={form.sale_price} onChange={(e) => f({ sale_price: e.target.value })} /></FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <FormField label="Rendimiento" hint="Aplicaciones por unidad"><input type="number" min="1" value={form.yield_per_unit} onChange={(e) => f({ yield_per_unit: e.target.value })} /></FormField>
                <FormField label="Stock actual"><input type="number" step="0.001" min="0" value={form.stock_quantity} onChange={(e) => f({ stock_quantity: e.target.value })} /></FormField>
                <FormField label="Stock mínimo"><input type="number" step="0.001" min="0" value={form.stock_min} onChange={(e) => f({ stock_min: e.target.value })} /></FormField>
              </div>
              <FormField label="Notas (proveedor, presentación)"><input value={form.notes} onChange={(e) => f({ notes: e.target.value })} /></FormField>
              {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
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
