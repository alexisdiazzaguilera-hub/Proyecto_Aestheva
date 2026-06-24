import { useEffect, useState } from "react";
import { api } from "../api/client";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import styles from "./Profesionales.module.css";

const AREAS = ["cosmiatra", "estetico", "nutricion"];
const AREA_LABELS = { cosmiatra: "Cosmiatra", estetico: "Estético", nutricion: "Nutrición" };
const COMMISSION_LABELS = { pct: "Porcentaje", fixed: "Monto fijo" };
const EMPTY_FORM = { name: "", area: "estetico", commission_type: "", commission_value: "" };

export default function Profesionales() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "create" | staff object
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setStaff(await api.get("/staff/"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError("");
    setModal("create");
  }

  function openEdit(st) {
    setForm({
      name: st.name,
      area: st.area ?? "estetico",
      commission_type: st.commission_type ?? "",
      commission_value: st.commission_value ?? "",
    });
    setError("");
    setModal(st);
  }

  function f(patch) { setForm((p) => ({ ...p, ...patch })); }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        area: form.area || null,
        commission_type: form.commission_type || null,
        commission_value: form.commission_value === "" ? null : Number(form.commission_value),
      };
      if (modal === "create") {
        await api.post("/staff/", payload);
      } else {
        await api.put(`/staff/${modal.id}`, payload);
      }
      setModal(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(st) {
    if (!confirm(`¿Dar de baja a ${st.name}?`)) return;
    try {
      await api.delete(`/staff/${st.id}`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div style={{ padding: 32 }}>Cargando...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Profesionales</h2>
        <button className="btn-primary" onClick={openCreate}>+ Nuevo Profesional</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {staff.length === 0 ? (
        <div className={styles.empty}>
          Aún no hay profesionales registrados. Agrega al personal que atiende las visitas
          para poder seleccionarlos al registrar ventas.
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Área</th>
                <th>Comisión</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((st) => (
                <tr key={st.id}>
                  <td className={styles.name}>{st.name}</td>
                  <td>{st.area ? AREA_LABELS[st.area] ?? st.area : "—"}</td>
                  <td>
                    {st.commission_type
                      ? `${COMMISSION_LABELS[st.commission_type] ?? st.commission_type}: ${st.commission_value ?? "—"}${st.commission_type === "pct" ? "%" : ""}`
                      : "—"}
                  </td>
                  <td className={styles.actions}>
                    <button className={styles.linkBtn} onClick={() => openEdit(st)}>Editar</button>
                    <button className={styles.linkBtnDanger} onClick={() => remove(st)}>Baja</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal
          title={modal === "create" ? "Nuevo Profesional" : "Editar Profesional"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={save}>
            <FormField label="Nombre completo">
              <input value={form.name} onChange={(e) => f({ name: e.target.value })} required autoFocus />
            </FormField>

            <FormField label="Área">
              <select value={form.area} onChange={(e) => f({ area: e.target.value })}>
                {AREAS.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
              </select>
            </FormField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Tipo de comisión (opcional)">
                <select value={form.commission_type} onChange={(e) => f({ commission_type: e.target.value })}>
                  <option value="">Sin comisión</option>
                  <option value="pct">Porcentaje</option>
                  <option value="fixed">Monto fijo</option>
                </select>
              </FormField>
              <FormField label="Valor">
                <input
                  type="number" step="0.01" min="0"
                  value={form.commission_value}
                  onChange={(e) => f({ commission_value: e.target.value })}
                  disabled={!form.commission_type}
                  placeholder={form.commission_type === "pct" ? "Ej: 10" : "Ej: 150"}
                />
              </FormField>
            </div>

            {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
