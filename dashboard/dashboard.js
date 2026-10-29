let allRows = [];
let stations = [];
let charts = {};

let selectedStation = "all";
let loading = false;

const DATA_PATH = "./data/";
const MANIFEST_PATH = `${DATA_PATH}manifest.json`;

const COLORS = [
  "#168b83",
  "#5689d6",
  "#a18bda",
  "#d49a54",
  "#d66f86",
  "#58a6a6",
  "#8b99a4",
  "#7b8cde"
];

// ============================================================
// FEATURES
// ============================================================

const number = (value, digits = 1) => {
  if (value === "" || value === null || value === undefined) {
    return "—";
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n.toLocaleString("es-CO", {
        maximumFractionDigits: digits
      })
    : "—";
};


const bytes = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "—";
  }

  const n = Number(value);

  if (!Number.isFinite(n)) return "—";

  if (n < 1000) {
    return `${number(n, 0)} B`;
  }

  const units = ["kB", "MB", "GB", "TB"];

  let v = n / 1000;
  let i = 0;

  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }

  return `${number(v, 2)} ${units[i]}`;
};


const dateLabel = (value, withDate = false) => {
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return String(value ?? "—");
  }

  return new Intl.DateTimeFormat(
    "es-CO",
    withDate
      ? {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC"
        }
      : {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC"
        }
  ).format(d);
};


const setText = (id, value) => {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
};


const numeric = (row, key) => {
  const value = row[key];

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
};


const stationNameFromFile = (fileName) => {
  const name = fileName
    .replace(/\.csv$/i, "")
    .replace(/^telemetry_/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  return name || fileName;
};


const stationIdFromFile = (fileName) => {
  return fileName
    .replace(/\.csv$/i, "")
    .toLowerCase();
};


const latestRecord = (rows) => {
  if (!rows.length) return null;

  return rows.reduce((latest, row) => {
    return row._date > latest._date ? row : latest;
  });
};


const average = (values) => {
  const valid = values.filter(
    value => value !== null && Number.isFinite(value)
  );

  if (!valid.length) return null;

  return valid.reduce((sum, value) => sum + value, 0)
    / valid.length;
};


// ============================================================
// ORGANIZACIÓN DE LOS DATOS
// ============================================================

function getStationRows(stationId) {
  return allRows.filter(
    row => row._stationId === stationId
  );
}


function getVisibleRows() {
  if (selectedStation === "all") {
    return allRows;
  }

  return getStationRows(selectedStation);
}


function getLatestByStation(rows = allRows) {
  const result = new Map();

  rows.forEach(row => {
    const current = result.get(row._stationId);

    if (!current || row._date > current._date) {
      result.set(row._stationId, row);
    }
  });

  return [...result.values()].sort(
    (a, b) => a._stationName.localeCompare(b._stationName)
  );
}


function getFilteredRows(rows) {
  const rangeSelect = document.getElementById("range-select");

  if (!rangeSelect || rangeSelect.value === "all" || !rows.length) {
    return rows;
  }

  const hours = Number(rangeSelect.value);

  if (!Number.isFinite(hours) || hours <= 0) {
    return rows;
  }

  const latestDate = Math.max(
    ...rows.map(row => row._date.getTime())
  );

  const cutoff = latestDate - hours * 3600000;

  const filtered = rows.filter(
    row => row._date.getTime() >= cutoff
  );

  return filtered.length ? filtered : rows.slice(-1);
}


// ============================================================
// SELECTOR DE ESTACIONES
// ============================================================

function createStationSelector() {
  if (document.getElementById("station-select")) {
    return;
  }

  const selector = document.createElement("select");

  selector.id = "station-select";
  selector.setAttribute("aria-label", "Seleccionar estación");

  selector.style.cssText = `
    padding: 8px 12px;
    border: 1px solid #dce4ec;
    border-radius: 8px;
    background: white;
    color: #304354;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    max-width: 220px;
  `;

  const allOption = document.createElement("option");

  allOption.value = "all";
  allOption.textContent = "Todas las estaciones";

  selector.appendChild(allOption);

  stations.forEach(station => {
    const option = document.createElement("option");

    option.value = station.id;
    option.textContent = station.name;

    selector.appendChild(option);
  });

  selector.value = selectedStation;

  selector.addEventListener("change", () => {
    selectedStation = selector.value;
    render();
  });

  const toolbar = document.querySelector(".toolbar");

  if (toolbar) {
    toolbar.prepend(selector);
  } else {
    const refreshButton = document.getElementById("refresh-button");

    if (refreshButton && refreshButton.parentElement) {
      refreshButton.parentElement.prepend(selector);
    }
  }
}


// ============================================================
// GRÁFICAS
// ============================================================

function makeChart(id, rows, series, options = {}) {
  const canvas = document.getElementById(id);

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  if (charts[id]) {
    charts[id].destroy();
  }

  const datasets = series.map(s => ({
    label: s.label,

    data: rows.map(row => numeric(row, s.key)),

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

    data: {
      labels: rows.map(row => dateLabel(row.timestamp, true)),
      datasets
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,

      interaction: {
        mode: "index",
        intersect: false
      },

      plugins: {
        legend: {
          display: datasets.length > 1,
          position: "bottom",

          labels: {
            usePointStyle: true,
            boxWidth: 7,
            padding: 18,
            color: "#748392",
            font: { size: 10 }
          }
        },

        tooltip: {
          callbacks: {
            label: context => {
              const value = context.parsed.y;

              return `${context.dataset.label}: ${
                value === null
                  ? "Sin dato"
                  : number(value, 2) + (options.suffix || "")
              }`;
            }
          }
        }
      },

      scales: {
        x: {
          grid: { display: false },

          ticks: {
            maxTicksLimit: 7,
            maxRotation: 0,
            color: "#8b99a4",
            font: { size: 9 }
          },

          border: { display: false }
        },

        y: {
          beginAtZero: true,
          suggestedMax: options.max,

          grid: { color: "#edf1f5" },

          ticks: {
            color: "#8b99a4",
            font: { size: 10 },

            callback: value =>
              `${value}${options.suffix || ""}`
          },

          border: { display: false }
        }
      }
    }
  });
}


// Crea una serie de datos independiente para cada estación.
// Los registros de una estación no se conectan con los de otra.

function makeStationChart(id, rows, key, options = {}) {
  const grouped = new Map();

  rows.forEach(row => {
    if (!grouped.has(row._stationId)) {
      grouped.set(row._stationId, []);
    }

    grouped.get(row._stationId).push(row);
  });

  const datasets = [];

  let colorIndex = 0;

  grouped.forEach((stationRows, stationId) => {
    const station = stations.find(s => s.id === stationId);

    const color = COLORS[colorIndex % COLORS.length];

    colorIndex++;

    datasets.push({
      label: station
        ? station.name
        : stationRows[0]._stationName,

      data: stationRows.map(row => ({
        x: row._date.getTime(),
        y: numeric(row, key)
      })),

      borderColor: color,
      backgroundColor: color + "22",

      borderWidth: 2,

      pointRadius: stationRows.length > 100 ? 0 : 2,
      pointHoverRadius: 4,

      tension: 0.28,
      fill: false,
      spanGaps: false
    });
  });

  const canvas = document.getElementById(id);

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  if (charts[id]) {
    charts[id].destroy();
  }

  charts[id] = new Chart(canvas, {
    type: "line",

    data: { datasets },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,

      interaction: {
        mode: "nearest",
        intersect: false
      },

      plugins: {
        legend: {
          display: datasets.length > 1,

          position: "bottom",

          labels: {
            usePointStyle: true,
            boxWidth: 7,
            padding: 18,
            color: "#748392",
            font: { size: 10 }
          }
        },

        tooltip: {
          callbacks: {
            title: items => {
              if (!items.length) return "";

              return dateLabel(
                items[0].parsed.x,
                true
              );
            },

            label: context => {
              const value = context.parsed.y;

              return `${context.dataset.label}: ${
                value === null
                  ? "Sin dato"
                  : number(value, 2) + (options.suffix || "")
              }`;
            }
          }
        }
      },

      scales: {
        x: {
          type: "time",

          time: {
            tooltipFormat: "dd/MM/yyyy HH:mm"
          },

          grid: { display: false },

          ticks: {
            maxTicksLimit: 7,
            maxRotation: 0,
            color: "#8b99a4",
            font: { size: 9 }
          },

          border: { display: false }
        },

        y: {
          beginAtZero: true,
          suggestedMax: options.max,

          grid: { color: "#edf1f5" },

          ticks: {
            color: "#8b99a4",
            font: { size: 10 },

            callback: value =>
              `${value}${options.suffix || ""}`
          },

          border: { display: false }
        }
      }
    }
  });
}


// ============================================================
// INDICADORES Y ESTADÍSTICAS
// ============================================================

function renderStationInfo(last) {
  if (!last) return;

  setText("hostname", last.hostname || "Equipo sin nombre");

  setText(
    "device-id",
    `Identificador: ${last.device_id || last._stationId}`
  );

  setText("agent-version", last.agent_version || "—");

  setText(
    "last-seen",
    dateLabel(last.timestamp, true) + " UTC"
  );

  setText("kpi-cpu", number(last.cpu_usage_percent));
  setText("kpi-ram", number(last.ram_usage_percent));
  setText("kpi-storage", number(last.storage_usage_percent, 0));
  setText("kpi-gpu", number(last.gpu_usage_percent, 0));

  setText(
    "ram-detail",
    `${number(last.ram_used_gb, 2)} GB utilizados`
  );

  setText(
    "gpu-detail",
    `${number(last.gpu_memory_used_gb, 2)} GB de memoria gráfica`
  );

  for (const [key, field] of [
    ["cpu", "cpu_usage_percent"],
    ["ram", "ram_usage_percent"],
    ["storage", "storage_usage_percent"],
    ["gpu", "gpu_usage_percent"]
  ]) {
    const bar = document.getElementById(`bar-${key}`);

    if (bar) {
      const value = numeric(last, field);

      bar.style.width = `${
        value === null
          ? 0
          : Math.min(100, Math.max(0, value))
      }%`;
    }
  }

  setText("bytes-in", bytes(last.bytes_received));
  setText("bytes-out", bytes(last.bytes_sent));

  setText(
    "network-errors",
    number(
      (numeric(last, "errors_received") || 0) +
      (numeric(last, "errors_sent") || 0),
      0
    )
  );
}


function renderAllStationsInfo() {
  const latestRows = getLatestByStation();

  if (!latestRows.length) return;

  // Los KPI de utilización representan el promedio
  // de la última medición disponible de cada estación.

  setText(
    "hostname",
    `${latestRows.length} estaciones`
  );

  setText(
    "device-id",
    "Vista consolidada de infraestructura"
  );

  setText("agent-version", "Múltiples agentes");

  const latestDate = new Date(
    Math.max(...latestRows.map(row => row._date.getTime()))
  );

  setText(
    "last-seen",
    dateLabel(latestDate, true) + " UTC"
  );

  const fields = [
    ["cpu_usage_percent", "kpi-cpu", "bar-cpu"],
    ["ram_usage_percent", "kpi-ram", "bar-ram"],
    ["storage_usage_percent", "kpi-storage", "bar-storage"],
    ["gpu_usage_percent", "kpi-gpu", "bar-gpu"]
  ];

  fields.forEach(([field, kpi, barId]) => {
    const value = average(
      latestRows.map(row => numeric(row, field))
    );

    setText(
      kpi,
      number(value, field === "storage_usage_percent" ||
                     field === "gpu_usage_percent" ? 0 : 1)
    );

    const bar = document.getElementById(barId);

    if (bar) {
      bar.style.width = `${
        value === null
          ? 0
          : Math.min(100, Math.max(0, value))
      }%`;
    }
  });

  const ramTotal = latestRows.reduce(
    (sum, row) => sum + (numeric(row, "ram_used_gb") || 0),
    0
  );

  const gpuMemoryTotal = latestRows.reduce(
    (sum, row) => sum + (numeric(row, "gpu_memory_used_gb") || 0),
    0
  );

  setText(
    "ram-detail",
    `${number(ramTotal, 2)} GB utilizados en total`
  );

  setText(
    "gpu-detail",
    `${number(gpuMemoryTotal, 2)} GB de memoria gráfica`
  );

  // Los contadores de red de los equipos no se suman aquí,
  // porque podrían representar contadores acumulados
  // desde el inicio de cada estación.

  setText("bytes-in", "Selecciona una estación");
  setText("bytes-out", "Selecciona una estación");
  setText("network-errors", "Selecciona una estación");
}


function renderStatusCounts() {
  const latestRows = getLatestByStation();

  const online = latestRows.filter(
    row => String(row.state).trim().toLowerCase() === "online"
  ).length;

  const offline = latestRows.filter(
    row => String(row.state).trim().toLowerCase() === "offline"
  ).length;

  setText("online-count", number(online, 0));
  setText("offline-count", number(offline, 0));
  setText("record-count", number(allRows.length, 0));

  const first = allRows.reduce(
    (earliest, row) =>
      row._date < earliest._date ? row : earliest,
    allRows[0]
  );

  setText(
    "first-seen",
    dateLabel(first.timestamp, true) + " UTC"
  );
}


function renderDatasetSummary(rows) {
  const element = document.getElementById("data-sources");

  if (!element) return;

  const sources = [...new Set(
    rows.map(row => row._fileName)
  )];

  element.textContent = sources.join(", ") || "—";
  element.title = sources.join(", ");
}


// ============================================================
// RENDERIZADO PRINCIPAL
// ============================================================

function render() {
  if (!allRows.length) return;

  const visibleRows = getVisibleRows();

  if (!visibleRows.length) return;

  const filtered = getFilteredRows(visibleRows);

  if (selectedStation === "all") {
    renderAllStationsInfo();
  } else {
    const last = latestRecord(visibleRows);

    renderStationInfo(last);
  }

  renderStatusCounts();
  renderDatasetSummary(visibleRows);

  if (selectedStation === "all") {
    makeStationChart(
      "cpu-chart",
      filtered,
      "cpu_usage_percent",
      { suffix: "%", max: 100 }
    );

    makeStationChart(
      "ram-chart",
      filtered,
      "ram_usage_percent",
      { suffix: "%", max: 100 }
    );

    makeStationChart(
      "gpu-chart",
      filtered,
      "gpu_usage_percent",
      { suffix: "%", max: 100 }
    );

    makeStationChart(
      "vram-chart",
      filtered,
      "gpu_memory_used_gb",
      { suffix: " GB" }
    );
  } else {
    makeChart(
      "cpu-chart",
      filtered,
      [{
        key: "cpu_usage_percent",
        label: "CPU",
        color: "#168b83",
        fill: true
      }],
      { suffix: "%", max: 100 }
    );

    makeChart(
      "ram-chart",
      filtered,
      [{
        key: "ram_usage_percent",
        label: "RAM",
        color: "#5689d6",
        fill: true
      }],
      { suffix: "%", max: 100 }
    );

    makeChart(
      "gpu-chart",
      filtered,
      [{
        key: "gpu_usage_percent",
        label: "GPU",
        color: "#a18bda",
        fill: true
      }],
      { suffix: "%", max: 100 }
    );

    makeChart(
      "vram-chart",
      filtered,
      [{
        key: "gpu_memory_used_gb",
        label: "Memoria GPU",
        color: "#d49a54",
        fill: true
      }],
      { suffix: " GB" }
    );
  }

  // El tráfico de red se muestra únicamente para una estación.
  // bytes_received y bytes_sent pueden ser contadores acumulados.

  if (selectedStation !== "all") {
    makeChart(
      "network-chart",
      filtered,
      [
        {
          key: "bytes_received",
          label: "Recibidos",
          color: "#168b83"
        },
        {
          key: "bytes_sent",
          label: "Enviados",
          color: "#5689d6"
        }
      ]
    );
  } else {
    makeChart(
      "network-chart",
      [],
      [
        {
          key: "bytes_received",
          label: "Recibidos",
          color: "#168b83"
        },
        {
          key: "bytes_sent",
          label: "Enviados",
          color: "#5689d6"
        }
      ]
    );
  }
}


// ============================================================
// CARGA DE LOS CSV
// ============================================================

async function loadCSV() {
  if (loading) return;

  loading = true;

  const errorBox = document.getElementById("error-box");

  if (errorBox) {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  const refreshButton = document.getElementById("refresh-button");

  if (refreshButton) {
    refreshButton.disabled = true;
  }

  try {
    // 1. Cargar el manifiesto.

    const manifestResponse = await fetch(
      `${MANIFEST_PATH}?v=${Date.now()}`,
      { cache: "no-store" }
    );

    if (!manifestResponse.ok) {
      throw new Error(
        `No se pudo leer manifest.json (HTTP ${manifestResponse.status}).`
      );
    }

    const fileNames = await manifestResponse.json();

    if (!Array.isArray(fileNames) || !fileNames.length) {
      throw new Error(
        "manifest.json debe contener una lista de nombres de archivos CSV."
      );
    }

    // Evitar nombres vacíos o rutas arbitrarias.
    // El manifiesto debe listar archivos ubicados en dashboard/data/.

    const validFileNames = fileNames.filter(fileName => {
      return typeof fileName === "string" &&
        /^[a-zA-Z0-9_.-]+\.csv$/i.test(fileName);
    });

    if (!validFileNames.length) {
      throw new Error(
        "No se encontraron nombres de archivos CSV válidos en manifest.json."
      );
    }

    // 2. Cargar todos los CSV en paralelo.

    const results = await Promise.all(
      validFileNames.map(async (fileName, index) => {
        const url = `${DATA_PATH}${encodeURIComponent(fileName)}?v=${Date.now()}`;

        const stationId = stationIdFromFile(fileName);

        const stationName = stationNameFromFile(fileName);

        try {
          const response = await fetch(
            url,
            { cache: "no-store" }
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const csvText = await response.text();

          const parsed = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false
          });

          if (parsed.errors.length) {
            console.warn(
              `Avisos al procesar ${fileName}:`,
              parsed.errors.slice(0, 5)
            );
          }

          const rows = parsed.data
            .filter(row => row.timestamp)
            .map(row => {
              const date = new Date(row.timestamp);

              return {
                ...row,

                // Cada registro conserva el origen del CSV.
                // Así podemos distinguir estaciones incluso si
                // device_id no existe en los archivos antiguos.

                _stationId: stationId,

                _stationName: stationName,

                _fileName: fileName,

                _date: date,

                _sourceIndex: index
              };
            })
            .filter(row => !Number.isNaN(row._date.getTime()));

          return {
            fileName,
            stationId,
            stationName,
            rows,
            error: null
          };

        } catch (error) {
          console.error(
            `No se pudo procesar ${fileName}:`,
            error
          );

          return {
            fileName,
            stationId,
            stationName,
            rows: [],
            error
          };
        }
      })
    );

    // 3. Conservar las estaciones cargadas correctamente.

    stations = results
      .filter(result => result.rows.length > 0)
      .map(result => ({
        id: result.stationId,
        name: result.stationName,
        fileName: result.fileName,
        records: result.rows.length
      }));

    // 4. Combinar los registros de todos los CSV.

    allRows = results
      .flatMap(result => result.rows)
      .sort((a, b) => {
        const difference = a._date - b._date;

        if (difference !== 0) return difference;

        return a._stationName.localeCompare(b._stationName);
      });

    if (!allRows.length) {
      const failed = results
        .filter(result => result.error)
        .map(result => result.fileName);

      throw new Error(
        failed.length
          ? `No se pudieron cargar los CSV: ${failed.join(", ")}.`
          : "Los CSV no contienen registros con timestamps válidos."
      );
    }

    // 5. Informar si alguno de los archivos falló.

    const failedFiles = results.filter(
      result => result.error
    );

    if (failedFiles.length && errorBox) {
      errorBox.hidden = false;

      errorBox.textContent =
        `Se cargaron ${stations.length} estaciones, pero hubo errores ` +
        `en: ${failedFiles.map(result => result.fileName).join(", ")}. ` +
        "Revisa la consola del navegador.";
    }

    // 6. Crear o actualizar el selector.

    createStationSelector();

    const selector = document.getElementById("station-select");

    if (selector) {
      const previousSelection = selectedStation;

      const selectionExists =
        previousSelection === "all" ||
        stations.some(station => station.id === previousSelection);

      if (!selectionExists) {
        selectedStation = "all";
      }

      selector.value = selectedStation;
    }

    // 7. Mostrar los datos.

    render();

    console.info("SavIA-Traffic: carga finalizada", {
      csvDeclarados: validFileNames.length,
      estacionesCargadas: stations.length,
      registrosTotales: allRows.length,
      archivosConError: failedFiles.map(result => result.fileName)
    });

  } catch (error) {
    console.error("Error cargando el dashboard:", error);

    if (errorBox) {
      errorBox.hidden = false;

      errorBox.textContent =
        `${error.message} Comprueba que manifest.json y los CSV ` +
        "estén en dashboard/data/ y que la página se abra desde un servidor web.";
    }

  } finally {
    loading = false;

    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}


// ============================================================
// EVENTOS
// ============================================================

const refreshButton = document.getElementById("refresh-button");

if (refreshButton) {
  refreshButton.addEventListener("click", loadCSV);
}

const rangeSelect = document.getElementById("range-select");

if (rangeSelect) {
  rangeSelect.addEventListener("change", render);
}

loadCSV();
