const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function ExportButton({ endpoint, filename, format = "csv", label, style = {} }) {
  function handleExport() {
    const token = localStorage.getItem("aestheva_token");
    const sep = endpoint.includes("?") ? "&" : "?";
    const url = `${API_BASE}${endpoint}${sep}format=${format}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Error al exportar");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${filename}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => alert(e.message));
  }

  return (
    <button className="btn btn-outline" style={{ fontSize: 12, padding: "6px 14px", ...style }} onClick={handleExport}>
      {label ?? `Exportar ${format.toUpperCase()}`}
    </button>
  );
}
