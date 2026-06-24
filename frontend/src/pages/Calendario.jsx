import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import styles from "./Calendario.module.css";

const HOUR_START = 8;   // 8am
const HOUR_END   = 21;  // 9pm
const HOUR_H     = 80;  // px per hour
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const DAY_NAMES  = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const STATUS_LABELS = {
  agendada: "Agendada", confirmada: "Confirmada",
  en_proceso: "En proceso", completada: "Completada", cancelada: "Cancelada",
};
const PAYMENT_LABELS = { efectivo: "Efectivo", tarjeta: "Tarjeta", msi: "3 MSI" };

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtWeekRange(monday) {
  const sunday = addDays(monday, 6);
  const opts = { day: "numeric", month: "short" };
  return `${monday.toLocaleDateString("es-MX", opts)} — ${sunday.toLocaleDateString("es-MX", { ...opts, year: "numeric" })}`;
}

function getAreaFromServices(services) {
  if (!services?.length) return "default";
  const svc = services.find(s => s.service_id);
  return svc?.area ?? "default";
}

export default function Calendario() {
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState(null); // { appt, x, y }
  const popupRef = useRef(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = monday.toISOString();
      const to = addDays(monday, 7).toISOString();
      const data = await api.get(`/appointments/?date_from=${from}&date_to=${to}`);
      setAppointments(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [monday]);

  useEffect(() => { load(); }, [load]);

  // Cerrar popup al hacer clic fuera
  useEffect(() => {
    function handler(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopup(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function prevWeek() { setMonday(d => addDays(d, -7)); }
  function nextWeek() { setMonday(d => addDays(d, 7)); }
  function goToday()  { setMonday(getMonday(new Date())); }

  function getApptForDay(dayDate) {
    return appointments.filter(a => {
      const d = new Date(a.scheduled_at);
      return d.getFullYear() === dayDate.getFullYear() &&
             d.getMonth() === dayDate.getMonth() &&
             d.getDate() === dayDate.getDate();
    });
  }

  function getCardStyle(appt) {
    const d = new Date(appt.scheduled_at);
    const hourDecimal = d.getHours() + d.getMinutes() / 60;
    const top = Math.max(0, (hourDecimal - HOUR_START) * HOUR_H);
    const height = Math.max(32, ((appt.duration_min ?? 60) / 60) * HOUR_H - 4);
    return { top, height };
  }

  function getAreaClass(appt) {
    const firstSvc = appt.services?.[0];
    // area viene en el snapshot del servicio via la relación — si no, default
    const area = firstSvc?.area ?? "default";
    return styles[`area-${area}`] ?? styles["area-default"];
  }

  function openPopup(e, appt) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({
      appt,
      x: Math.min(rect.right + 8, window.innerWidth - 310),
      y: Math.min(rect.top, window.innerHeight - 320),
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Calendario</h2>
        <div className={styles.weekNav}>
          <button className={styles.navBtn} onClick={prevWeek}>‹</button>
          <span className={styles.weekLabel}>{fmtWeekRange(monday)}</span>
          <button className={styles.navBtn} onClick={nextWeek}>›</button>
          <button className={styles.todayBtn} onClick={goToday}>Hoy</button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.calendarWrap}>
        <div className={styles.grid}>
          {/* Cabecera */}
          <div className={styles.cornerCell} />
          {weekDays.map((day, i) => {
            const isToday = day.getTime() === today.getTime();
            return (
              <div key={i} className={`${styles.dayHeader} ${isToday ? styles.today : ""}`}>
                <div className={styles.dayName}>{DAY_NAMES[i]}</div>
                <div className={styles.dayNum}>{day.getDate()}</div>
              </div>
            );
          })}

          {/* Columna de horas */}
          <div className={styles.timeCol}>
            {HOURS.map(h => (
              <div key={h} className={styles.hourLabel}>
                {h}:00
              </div>
            ))}
          </div>

          {/* Columnas de días */}
          {weekDays.map((day, di) => {
            const dayAppts = getApptForDay(day);
            return (
              <div key={di} className={styles.dayCol}>
                {/* Líneas de horas */}
                {HOURS.map((h, i) => (
                  <div key={h}>
                    <div className={styles.hourLine} style={{ top: i * HOUR_H }} />
                    <div className={styles.halfLine} style={{ top: i * HOUR_H + HOUR_H / 2 }} />
                  </div>
                ))}

                {/* Citas */}
                {!loading && dayAppts.map(appt => {
                  const { top, height } = getCardStyle(appt);
                  const d = new Date(appt.scheduled_at);
                  const timeStr = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
                  const serviceNames = appt.services?.map(s => s.service_name_snapshot).join(", ") ?? "—";
                  const areaClass = getAreaClass(appt);

                  return (
                    <div
                      key={appt.id}
                      className={`${styles.apptCard} ${areaClass} ${styles[`status-${appt.status}`] ?? ""}`}
                      style={{ top, height }}
                      onClick={(e) => openPopup(e, appt)}
                    >
                      <div className={styles.apptTime}>
                        <span className={`${styles.statusDot} ${styles[`dot-${appt.status}`]}`} />
                        {timeStr}
                      </div>
                      {height >= 44 && <div className={styles.apptClient}>{appt.client?.full_name}</div>}
                      {height >= 60 && <div className={styles.apptService}>{serviceNames}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Popup de detalle */}
      {popup && (
        <div
          ref={popupRef}
          className={styles.popup}
          style={{ left: popup.x, top: popup.y }}
        >
          <div className={styles.popupHeader}>
            <span className={styles.popupTitle}>{popup.appt.client?.full_name}</span>
            <button className={styles.popupClose} onClick={() => setPopup(null)}>✕</button>
          </div>
          {[
            { k: "Hora", v: new Date(popup.appt.scheduled_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) },
            { k: "Duración", v: `${popup.appt.duration_min} min` },
            { k: "Servicios", v: popup.appt.services?.map(s => s.service_name_snapshot).join(", ") ?? "—" },
            { k: "Profesional", v: [...new Set(popup.appt.services?.map(s => s.staff_name_snapshot).filter(Boolean))].join(", ") || "—" },
            { k: "Estado", v: STATUS_LABELS[popup.appt.status] ?? popup.appt.status },
            popup.appt.final_price != null && { k: "Precio", v: `$${Number(popup.appt.final_price).toLocaleString("es-MX")}` },
            popup.appt.payment_method && { k: "Pago", v: PAYMENT_LABELS[popup.appt.payment_method] ?? popup.appt.payment_method },
            popup.appt.notes && { k: "Notas", v: popup.appt.notes },
          ].filter(Boolean).map(({ k, v }) => (
            <div key={k} className={styles.popupRow}>
              <span className={styles.popupKey}>{k}</span>
              <span className={styles.popupVal}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
