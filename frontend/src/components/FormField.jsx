import styles from "./FormField.module.css";

export default function FormField({ label, children, hint }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
