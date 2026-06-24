import { useEffect, useState } from "react";
import { api } from "../api/client";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import styles from "./Citas.module.css";

const STATUS_LABELS = {
  agendada: "Agendada", confirmada: "Confirmada",
  en_proceso: "En proceso", completada: "Completada", cancelada: "Cancelada",
};
const LEAD_LABELS = {
  instagram: "Instagram", facebook: "Facebook", google: "Google",
  referido: "Referido", walk_in: "Walk-in", otro: "Otro",
};
const PAYMENT_LABELS = { efectivo: "Efectivo", tarjeta: "Tarjeta", msi: "3 MSI" };
const FILTERS = [
  { key: "all", label: "Todas" },
  { key: "agendada", label: "Agendadas" },
  { key: "en_proceso", label: "En proceso" },
  { key: "completada", label: "Completadas" },
];
const EMPTY_SERVICE_LINE = { service_id: "", service_name: "", staff_id: "", unit_price: "", floor_price: null };

function StatusBadge({ status }) {
  return (
    <span className={`${styles.status} ${styles[`status-${status}`]}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function Citas({ user }) {
  const isAdmin = user?.role === "administrador";

  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modales
  const [createModal, setCreateModal] = useState(false);
  const [closeModal, setCloseModal] = useState(null);   // appointment object
  const [approveModal, setApproveModal] = useState(null); // appointment object
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // Formulario nueva cita
  const [form, setForm] = useState({
    client_name: "", client_email: "", client_phone: "",
    lead_source: "", initial_inquiry: "",
    scheduled_at: "", duration_min: "60", notes: "",
  });
  const [serviceLines, setServiceLines] = useState([{ ...EMPTY_SERVICE_LINE }]);

  // Formulario cierre
  const [closeForm, setCloseForm] = useState({ final_price: "", payment_method: "efectivo", commission_amount: "", notes: "" });

  // Formulario aprobación
  const [approveForm, setApproveForm] = useState({ final_price: "", payment_method: "", commission_amount: "" });

  async function load() {
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const [appts, pending] = await Promise.all([
        api.get(`/appointments/${params}`),
        isAdmin ? api.get("/appointments/alerts/pending-financials") : Promise.resolve([]),
      ]);
      setAppointments(appts);
      setPendingCount(pending.length);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    const [svcs, staff] = await Promise.all([
      api.get("/services/catalog"),
      api.get("/staff/").catch(() => []),
    ]);
    setServices(svcs);
    setStaffList(staff);
  }

  useEffect(() => { loadCatalog(); }, []);
  useEffect(() => { setLoading(true); load(); }, [filter]);

  // ── Helpers formulario ────────────────────────────────────────────────────

  function f(patch) { setForm(p => ({ ...p, ...patch })); }

  function updateLine(idx, patch) {
    setServiceLines(lines => lines.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...patch };
      // Auto-fill service name when service changes
      if (patch.service_id !== undefined) {
        const svc = services.find(s => s.id === patch.service_id);
        updated.service_name = svc?.name ?? "";
        updated.unit_price = svc?.sale_price ?? "";
        updated.floor_price = svc?.floor_price ?? null;
      }
      return updated;
    }));
  }

  function addLine() { setServiceLines(l => [...l, { ...EMPTY_SERVICE_LINE }]); }
  function removeLine(idx) { setServiceLines(l => l.filter((_, i) => i !== idx)); }

  // ── Crear cita ────────────────────────────────────────────────────────────

  function openCreate() {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    setForm({
      client_name: "", client_email: "", client_phone: "",
      lead_source: "", initial_inquiry: "",
      scheduled_at: now.toISOString().slice(0, 16),
      duration_min: "60", notes: "",
    });
    setServiceLines([{ ...EMPTY_SERVICE_LINE }]);
    setModalError("");
    setCreateModal(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (serviceLines.some(l => !l.service_name.trim())) {
      setModalError("Cada servicio necesita un nombre.");
      return;
    }
    setSaving(true);
    setModalError("");
    try {
      await api.post("/appointments/", {
        client_name: form.client_name,
        client_email: form.client_email || null,
        client_phone: form.client_phone || null,
        lead_source: form.lead_source || null,
        initial_inquiry: form.initial_inquiry || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_min: Number(form.duration_min),
        notes: form.notes || null,
        services: serviceLines.map((l, i) => ({
          service_id: l.service_id || null,
          service_name: l.service_name,
          staff_id: l.staff_id || null,
          unit_price: l.unit_price !== "" ? Number(l.unit_price) : null,
          sort_order: i,
        })),
      });
      setCreateModal(false);
      await load();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Cambiar status ────────────────────────────────────────────────────────

  async function changeStatus(appt, status) {
    try {
      await api.patch(`/appointments/${appt.id}/status?status=${status}`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Cerrar servicio ───────────────────────────────────────────────────────

  function openClose(appt) {
    setCloseForm({ final_price: appt.final_price ?? "", payment_method: "efectivo", commission_amount: appt.commission_amount ?? "", notes: "" });
    setModalError("");
    setCloseModal(appt);
  }

  async function handleClose(e) {
    e.preventDefault();
    setSaving(true);
    setModalError("");
    try {
      await api.patch(`/appointments/${closeModal.id}/close`, {
        final_price: Number(closeForm.final_price),
        payment_method: closeForm.payment_method,
        commission_amount: closeForm.commission_amount !== "" ? Number(closeForm.commission_amount) : null,
        notes: closeForm.notes || null,
      });
      setCloseModal(null);
      await load();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Aprobar financieros (admin) ───────────────────────────────────────────

  function openApprove(appt) {
    setApproveForm({
      final_price: appt.final_price ?? "",
      payment_method: appt.payment_method ?? "efectivo",
      commission_amount: appt.commission_amount ?? "",
    });
    setModalError("");
    setApproveModal(appt);
  }

  async function handleApprove(e) {
    e.preventDefault();
    setSaving(true);
    setModalError("");
    try {
      await api.patch(`/appointments/${approveModal.id}/approve`, {
        final_price: approveForm.final_price !== "" ? Number(approveForm.final_price) : null,
        payment_method: approveForm.payment_method || null,
        commission_amount: approveForm.commission_amount !== "" ? Number(approveForm.commission_amount) : null,
      });
      setApproveModal(null);
      await load();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="spinner" />;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2>Citas</h2>
        <button className="btn-primary" onClick={openCreate}>+ Nueva Cita</button>
      </div>

      {/* Alerta de financieros pendientes (solo admin) */}
      {isAdmin && pendingCount > 0 && (
        <div className={styles.alertBanner}>
          <span>⚠</span>
          <span>
            <strong>{pendingCount} {pendingCount === 1 ? "cita" : "citas"}</strong> completadas sin datos financieros aprobados.{" "}
            <button
              style={{ background: "none", color: "#7a5c00", fontWeight: 600, textDecoration: "underline", padding: 0, cursor: "pointer" }}
              onClick={() => setFilter("completada")}
            >
              Ver completadas
            </button>
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className={styles.filters}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.filterBtn} ${filter === key ? styles.active : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Tabla */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Cliente</th>
              <th>Servicios</th>
              <th>Estado</th>
              <th>Precio</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {appointments.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className={styles.empty}>
                    Sin citas {filter !== "all" ? `con estado "${STATUS_LABELS[filter]}"` : "registradas"}.
                  </div>
                </td>
              </tr>
            )}
            {appointments.map(appt => {
              const dt = formatDateTime(appt.scheduled_at);
              const canClose = ["agendada", "confirmada", "en_proceso"].includes(appt.status);
              const needsApproval = isAdmin && appt.status === "completada" && !appt.financial_complete;
              return (
                <tr key={appt.id}>
                  <td className={styles.dateCol}>
                    <div className={styles.dateTime}>{dt.date}</div>
                    <div>{dt.time}</div>
                  </td>
                  <td>
                    <div className={styles.clientName}>{appt.client?.full_name}</div>
                    {appt.client?.lead_source && (
                      <div className={styles.clientMeta}>{LEAD_LABELS[appt.client.lead_source] ?? appt.client.lead_source}</div>
                    )}
                  </td>
                  <td>
                    <div className={styles.serviceList}>
                      {appt.services.map(s => (
                        <div key={s.id}>
                          <span className={styles.serviceLine}>{s.service_name_snapshot}</span>
                          {s.staff_name_snapshot && (
                            <span className={styles.staffChip}> · {s.staff_name_snapshot}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={appt.status} />
                    {needsApproval && <span className={styles.alertDot} title="Financieros pendientes" />}
                  </td>
                  <td>
                    {appt.final_price != null
                      ? <span className={styles.priceCol}>${Number(appt.final_price).toLocaleString("es-MX")}</span>
                      : <span className={styles.priceEmpty}>Sin precio</span>
                    }
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {canClose && (
                        <button className={styles.linkBtnSuccess} onClick={() => openClose(appt)}>
                          Cerrar
                        </button>
                      )}
                      {needsApproval && (
                        <button className={styles.linkBtn} onClick={() => openApprove(appt)}>
                          Aprobar
                        </button>
                      )}
                      {appt.status === "agendada" && (
                        <button className={styles.linkBtnDanger} onClick={() => changeStatus(appt, "cancelada")}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Nueva Cita ──────────────────────────────────────────────── */}
      {createModal && (
        <Modal title="Nueva Cita" onClose={() => setCreateModal(false)}>
          <form onSubmit={handleCreate}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Cliente */}
              <FormField label="Nombre del cliente *">
                <input value={form.client_name} onChange={e => f({ client_name: e.target.value })} required autoFocus placeholder="Nombre completo" />
              </FormField>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Email (opcional)">
                  <input type="email" value={form.client_email} onChange={e => f({ client_email: e.target.value })} placeholder="correo@ejemplo.com" />
                </FormField>
                <FormField label="Teléfono (opcional)">
                  <input value={form.client_phone} onChange={e => f({ client_phone: e.target.value })} placeholder="55 1234 5678" />
                </FormField>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Origen del lead">
                  <select value={form.lead_source} onChange={e => f({ lead_source: e.target.value })}>
                    <option value="">Desconocido</option>
                    {Object.entries(LEAD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </FormField>
                <FormField label="Motivo de consulta">
                  <input value={form.initial_inquiry} onChange={e => f({ initial_inquiry: e.target.value })} placeholder="Ej: Reducción de medidas" />
                </FormField>
              </div>

              {/* Fecha y duración */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <FormField label="Fecha y hora *">
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => f({ scheduled_at: e.target.value })} required />
                </FormField>
                <FormField label="Duración (min)">
                  <input type="number" min="15" step="15" value={form.duration_min} onChange={e => f({ duration_min: e.target.value })} />
                </FormField>
              </div>

              {/* Servicios */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                  Servicios
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {serviceLines.map((line, idx) => (
                    <div key={idx} className={styles.serviceBlock}>
                      <div className={styles.serviceBlockHeader}>
                        <span className={styles.serviceBlockLabel}>Servicio {idx + 1}</span>
                        {serviceLines.length > 1 && (
                          <button type="button" className={styles.removeBtn} onClick={() => removeLine(idx)}>✕</button>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <FormField label="Servicio">
                          <select value={line.service_id} onChange={e => updateLine(idx, { service_id: e.target.value })}>
                            <option value="">Seleccionar...</option>
                            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </FormField>
                        <FormField label="Profesional">
                          <select value={line.staff_id} onChange={e => updateLine(idx, { staff_id: e.target.value })}>
                            <option value="">Sin asignar</option>
                            {staffList.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                          </select>
                        </FormField>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <FormField label="Nombre personalizado (si no está en catálogo)">
                          <input
                            value={line.service_name}
                            onChange={e => updateLine(idx, { service_name: e.target.value, service_id: "" })}
                            placeholder="O escribe el nombre aquí"
                          />
                        </FormField>
                        <FormField label={line.floor_price ? `Precio (piso: $${Number(line.floor_price).toLocaleString("es-MX")})` : "Precio (opcional)"}>
                          <input
                            type="number" step="0.01" min="0"
                            value={line.unit_price}
                            onChange={e => updateLine(idx, { unit_price: e.target.value })}
                            placeholder={line.floor_price ? `Mín. $${Number(line.floor_price).toLocaleString("es-MX")}` : "Dejar vacío si no se sabe"}
                          />
                        </FormField>
                      </div>
                    </div>
                  ))}
                  <button type="button" className={styles.addServiceBtn} onClick={addLine}>
                    + Agregar otro servicio
                  </button>
                </div>
              </div>

              <FormField label="Notas internas (opcional)">
                <textarea
                  value={form.notes}
                  onChange={e => f({ notes: e.target.value })}
                  rows={2}
                  style={{ resize: "vertical" }}
                  placeholder="Indicaciones especiales, historial relevante..."
                />
              </FormField>

              {modalError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{modalError}</p>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={() => setCreateModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Guardando..." : "Agendar Cita"}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal: Cerrar Servicio ─────────────────────────────────────────── */}
      {closeModal && (
        <Modal title="Cerrar Servicio" onClose={() => setCloseModal(null)}>
          <form onSubmit={handleClose}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Cliente</span>
                <span className={styles.infoValue}>{closeModal.client?.full_name}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Servicios</span>
                <span className={styles.infoValue}>{closeModal.services.map(s => s.service_name_snapshot).join(", ")}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Precio cobrado ($) *">
                  <input type="number" step="0.01" min="0" value={closeForm.final_price} onChange={e => setCloseForm(p => ({ ...p, final_price: e.target.value }))} required autoFocus />
                </FormField>
                <FormField label="Método de pago *">
                  <select value={closeForm.payment_method} onChange={e => setCloseForm(p => ({ ...p, payment_method: e.target.value }))}>
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </FormField>
              </div>

              <FormField label="Comisión del profesional ($) — opcional">
                <input
                  type="number" step="0.01" min="0"
                  value={closeForm.commission_amount}
                  onChange={e => setCloseForm(p => ({ ...p, commission_amount: e.target.value }))}
                  placeholder="Dejar vacío si no se sabe aún"
                />
              </FormField>

              <FormField label="Notas (opcional)">
                <input value={closeForm.notes} onChange={e => setCloseForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observaciones del servicio..." />
              </FormField>

              <p style={{ fontSize: 12, color: "var(--text-light)", background: "var(--cream)", padding: "10px 12px", borderRadius: "var(--radius-sm)" }}>
                Si dejas la comisión vacía, administración la completará al aprobar.
              </p>

              {modalError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{modalError}</p>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={() => setCloseModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Guardando..." : "Completar Servicio"}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal: Aprobar Financieros (admin) ────────────────────────────── */}
      {approveModal && (
        <Modal title="Aprobar Datos Financieros" onClose={() => setApproveModal(null)}>
          <form onSubmit={handleApprove}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Cliente</span>
                <span className={styles.infoValue}>{approveModal.client?.full_name}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Servicios</span>
                <span className={styles.infoValue}>{approveModal.services.map(s => s.service_name_snapshot).join(", ")}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Profesional(es)</span>
                <span className={styles.infoValue}>
                  {[...new Set(approveModal.services.map(s => s.staff_name_snapshot).filter(Boolean))].join(", ") || "—"}
                </span>
              </div>

              <div className={styles.approveGrid}>
                <FormField label="Precio final ($)">
                  <input type="number" step="0.01" min="0" value={approveForm.final_price} onChange={e => setApproveForm(p => ({ ...p, final_price: e.target.value }))} autoFocus />
                </FormField>
                <FormField label="Método de pago">
                  <select value={approveForm.payment_method} onChange={e => setApproveForm(p => ({ ...p, payment_method: e.target.value }))}>
                    <option value="">Sin cambios</option>
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </FormField>
                <FormField label="Comisión al profesional ($)">
                  <input type="number" step="0.01" min="0" value={approveForm.commission_amount} onChange={e => setApproveForm(p => ({ ...p, commission_amount: e.target.value }))} placeholder="Monto en pesos" />
                </FormField>
              </div>

              {modalError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{modalError}</p>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={() => setApproveModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Guardando..." : "Aprobar y Cerrar"}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
