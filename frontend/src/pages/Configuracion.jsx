import { useEffect, useState } from "react";
import { api } from "../api/client";
import styles from "./Configuracion.module.css";

const PARAM_LABELS = {
  fixed_monthly_cost:      { label: "Costo fijo mensual total", hint: "Suma de renta, nómina, etc. (MXN)", group: "costos" },
  depreciation_life_months:{ label: "Vida útil equipos (meses)", hint: "Default para nuevos equipos", group: "equipos" },
  pct_bank_card:           { label: "Comisión tarjeta (%)", hint: "Porcentaje como decimal: 0.03 = 3%", group: "banco" },
  pct_bank_msi:            { label: "Comisión MSI (%)", hint: "Porcentaje como decimal: 0.09 = 9%", group: "banco" },
  pct_alloc_estetico:      { label: "Asignación Estético (%)", hint: "Fracción de costo fijo para Estético", group: "asignacion" },
  pct_alloc_cosmiatra:     { label: "Asignación Cosmiatra (%)", hint: "Fracción de costo fijo para Cosmiatra", group: "asignacion" },
  pct_alloc_nutricion:     { label: "Asignación Nutrición (%)", hint: "Fracción de costo fijo para Nutrición", group: "asignacion" },
  hours_month_estetico:    { label: "Horas/mes Estético", hint: "Horas disponibles de atención", group: "capacidad" },
  hours_month_cosmiatra:   { label: "Horas/mes Cosmiatra", hint: "Horas disponibles de atención", group: "capacidad" },
  hours_month_nutricion:   { label: "Horas/mes Nutrición", hint: "Horas disponibles de atención", group: "capacidad" },
};

const GROUPS = {
  costos:     "Costos Fijos",
  banco:      "Comisiones Bancarias",
  asignacion: "Asignación de Costos por Área",
  capacidad:  "Capacidad Instalada",
  equipos:    "Equipos",
};

export default function Configuracion() {
  const [params, setParams] = useState([]);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/config/"), api.get("/staff/")])
      .then(([cfg, stf]) => {
        setParams(cfg);
        const vals = {};
        cfg.forEach((p) => { vals[p.key] = p.value ?? ""; });
        setValues(vals);
        setUsers(stf);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function saveParam(key) {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await api.put(`/config/${key}`, { value: values[key] === "" ? null : Number(values[key]) });
      setSaved((s) => ({ ...s, [key]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [key]: false })), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  const byGroup = {};
  params.forEach((p) => {
    const meta = PARAM_LABELS[p.key];
    const group = meta?.group ?? "otros";
    if (!byGroup[group]) byGroup[group] = [];
    byGroup[group].push(p);
  });

  return (
    <div className={styles.container}>
      <h2>Configuración</h2>
      <p className={styles.subtitle}>
        Parámetros globales de la clínica. Los costos fijos se usan para calcular el punto de equilibrio y márgenes por área.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      {Object.entries(GROUPS).map(([groupKey, groupLabel]) => {
        const groupParams = byGroup[groupKey];
        if (!groupParams?.length) return null;
        return (
          <div key={groupKey} className={styles.section}>
            <h3>{groupLabel}</h3>
            {groupParams.map((p) => {
              const meta = PARAM_LABELS[p.key] ?? { label: p.key, hint: p.description };
              return (
                <div key={p.key} className={styles.paramRow}>
                  <div className={styles.paramInfo}>
                    <div className={styles.paramKey}>{meta.label}</div>
                    <div className={styles.paramDesc}>{meta.hint}</div>
                  </div>
                  <input
                    className={styles.paramInput}
                    type="number"
                    step="any"
                    placeholder="—"
                    value={values[p.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && saveParam(p.key)}
                  />
                  <button
                    className={`btn btn-outline ${styles.saveBtn}`}
                    disabled={saving[p.key]}
                    onClick={() => saveParam(p.key)}
                    style={saved[p.key] ? { borderColor: "var(--success)", color: "var(--success)" } : {}}
                  >
                    {saved[p.key] ? "✓ Guardado" : saving[p.key] ? "..." : "Guardar"}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Usuarios del sistema */}
      <div className={styles.section}>
        <h3>Usuarios del Sistema</h3>
        {users.map((u) => (
          <div key={u.id} className={styles.staffRow}>
            <div>
              <div className={styles.staffName}>{u.name}</div>
              <div className={styles.staffEmail}>{u.specialty || "—"}</div>
            </div>
            <span className={`${styles.staffRole} ${u.role === "administrador" ? styles.roleAdmin : styles.roleRecep}`}>
              {u.role === "administrador" ? "Admin" : "Recepcionista"}
            </span>
          </div>
        ))}
        <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-light)" }}>
          Para cambiar contraseñas o agregar usuarios, contacta al administrador del sistema.
        </p>
      </div>
    </div>
  );
}
