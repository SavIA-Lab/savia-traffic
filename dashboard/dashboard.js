let allRows = [];
let charts = {};

const number = (value, digits = 1) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("es-CO", { maximumFractionDigits: digits }) : "—";
};
const bytes = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return `${number(n, 0)} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let v = n / 1000, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${number(v, 2)} ${units[i]}`;
};
const dateLabel = (value, withDate = false) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? "—");
  return new Intl.DateTimeFormat("es-CO", withDate
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
    : { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d);
};
const setText = (id, value) => { document.getElementById(id).textContent = value; };
const numeric = (row, key) => {
  const v = Number(row[key]);
  return row[key] !== "" && Number.isFinite(v) ? v : null;
};

function filteredRows() {
  const hours = document.getElementById("range-select").value;
  if (hours === "all" || !allRows.length) return allRows;
  const cutoff = allRows[allRows.length - 1]._date.getTime() - Number(hours) * 3600000;
  const selected = allRows.filter(r => r._date.getTime() >= cutoff);
  return selected.length ? selected : allRows.slice(-1);
}

function makeChart(id, rows, series, options = {}) {
  const canvas = document.getElementById(id);
  if (charts[id]) charts[id].destroy();
  const datasets = series.map(s => ({
    label: s.label,
    data: rows.map(r => numeric(r, s.key)),
    borderColor: s.color,
    backgroundColor: s.color + "22",
    borderWidth: 2,
    pointRadius: rows.length > 100 ? 0 : 2,
    pointHoverRadius: 4,
    tension: 0.28,
    fill: s.fill || false,
    spanGaps: false
  }));
  charts[id] = new Chart(canvas, {
    type: "line",
    data: { labels: rows.map(r => dateLabel(r.timestamp, true)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: series.length > 1, position: "bottom", labels: { usePointStyle: true, boxWidth: 7, padding: 18, color: "#748392", font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${number(ctx.parsed.y, 2)}${options.suffix || ""}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0, color: "#8b99a4", font: { size: 9 } }, border: { display: false } },
        y: { beginAtZero: true, suggestedMax: options.max, grid: { color: "#edf1f5" }, ticks: { color: "#8b99a4", font: { size: 10 }, callback: v => `${v}${options.suffix || ""}` }, border: { display: false } }
      }
    }
  });
}

function render() {
  if (!allRows.length) return;
  const rows = filteredRows();
  const last = allRows[allRows.length - 1];
  const first = allRows[0];
  setText("hostname", last.hostname || "Equipo sin nombre");
  setText("device-id", `Identificador: ${last.device_id || "—"}`);
  setText("agent-version", last.agent_version || "—");
  setText("last-seen", dateLabel(last.timestamp, true) + " UTC");
  setText("kpi-cpu", number(last.cpu_usage_percent)); setText("kpi-ram", number(last.ram_usage_percent));
  setText("kpi-storage", number(last.storage_usage_percent, 0)); setText("kpi-gpu", number(last.gpu_usage_percent, 0));
  setText("ram-detail", `${number(last.ram_used_gb, 2)} GB utilizados`);
  setText("gpu-detail", `${number(last.gpu_memory_used_gb, 2)} GB de memoria gráfica`);
  for (const [key, field] of [["cpu", "cpu_usage_percent"], ["ram", "ram_usage_percent"], ["storage", "storage_usage_percent"], ["gpu", "gpu_usage_percent"]]) {
    document.getElementById(`bar-${key}`).style.width = `${Math.min(100, Math.max(0, Number(last[field]) || 0))}%`;
  }
  setText("bytes-in", bytes(last.bytes_received)); setText("bytes-out", bytes(last.bytes_sent));
  setText("network-errors", number((Number(last.errors_received) || 0) + (Number(last.errors_sent) || 0), 0));
  setText("online-count", number(allRows.filter(r => String(r.state).toLowerCase() === "online").length, 0));
  setText("offline-count", number(allRows.filter(r => String(r.state).toLowerCase() === "offline").length, 0));
  setText("record-count", number(allRows.length, 0));
  setText("first-seen", dateLabel(first.timestamp, true) + " UTC");

  makeChart("cpu-chart", rows, [{ key: "cpu_usage_percent", label: "CPU", color: "#168b83", fill: true }], { suffix: "%", max: 100 });
  makeChart("ram-chart", rows, [{ key: "ram_usage_percent", label: "RAM", color: "#5689d6", fill: true }], { suffix: "%", max: 100 });
  makeChart("gpu-chart", rows, [{ key: "gpu_usage_percent", label: "GPU", color: "#a18bda", fill: true }], { suffix: "%", max: 100 });
  makeChart("vram-chart", rows, [{ key: "gpu_memory_used_gb", label: "Memoria GPU", color: "#d49a54", fill: true }], { suffix: " GB" });
  makeChart("network-chart", rows, [
    { key: "bytes_received", label: "Recibidos", color: "#168b83" },
    { key: "bytes_sent", label: "Enviados", color: "#5689d6" }
  ]);
}

async function loadCSV() {
  const errorBox = document.getElementById("error-box");
  errorBox.hidden = true;
  try {
    // 1. Cargar el archivo manifest.json con la lista de nombres de CSV
    const manifestRes = await fetch(`./data/manifest.json?v=${Date.now()}`, { cache: "no-store" });
    if (!manifestRes.ok) throw new Error(`No se pudo leer el archivo manifest.json (HTTP ${manifestRes.status}).`);
    const fileNames = await manifestRes.json();

    if (!Array.isArray(fileNames) || !fileNames.length) {
      throw new Error("El archivo manifest.json está vacío o no tiene un formato de lista válido.");
    }

    // 2. Cargar todos los archivos CSV listados en paralelo
    const promises = fileNames.map(async (fileName) => {
      const fileUrl = `./data/${fileName}`;
      try {
        const response = await fetch(`${fileUrl}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) {
          console.warn(`No se pudo leer ${fileUrl} (HTTP ${response.status}), se omitirá.`);
          return [];
        }
        const text = await response.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
        if (parsed.errors.length) console.warn(`Avisos al leer ${fileName}:`, parsed.errors.slice(0, 5));
        return parsed.data.filter(r => r.timestamp);
      } catch (err) {
        console.warn(`Error procesando ${fileName}:`, err);
        return [];
      }
    });

    const results = await Promise.all(promises);
    let combinedData = [];
    results.forEach(rows => {
      combinedData = combinedData.concat(rows);
    });

    // 3. Procesar, validar y ordenar cronológicamente todos los registros combinados
    allRows = combinedData
      .map(r => ({ ...r, _date: new Date(r.timestamp) }))
      .filter(r => !Number.isNaN(r._date.getTime()))
      .sort((a, b) => a._date - b._date);

    if (!allRows.length) throw new Error("Los archivos se cargaron, pero no contienen registros con timestamps válidos.");
    
    render();
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = `${error.message} Comprueba que manifest.json y los archivos CSV estén en la carpeta ./data/ y que abras la página desde un servidor web.`;
    console.error(error);
  }
}

document.getElementById("refresh-button").addEventListener("click", loadCSV);
document.getElementById("range-select").addEventListener("change", render);
loadCSV();
