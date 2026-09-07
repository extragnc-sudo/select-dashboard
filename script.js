const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSU-oG-TKjKenhP-yY6wcEyf6gZizKWmboIt6PHavsexY_t3UnIPXuGLcg_MuL379GUy2jaawNCYSSq/pub?gid=0&single=true&output=csv";

let todosLosDatos = [];
let vistaActual = "curso"; 
let chartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    cargarCSV();
});

function cargarCSV() {
    Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            todosLosDatos = results.data.filter(f => f["Fecha (c3)"] && f["Fecha (c3)"].trim() !== "");
            poblarSelectorHistorico();
            procesarDashboard();
        }
    });
}

function parsearMonto(valor) {
    if (!valor) return 0;
    let str = valor.toString().replace(/\$/g, "").trim();
    if (str.includes(",") && str.includes(".")) str = str.replace(/\./g, "").replace(",", ".");
    else if (str.includes(",")) str = str.replace(",", ".");
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
}

function formatearARS(monto) {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(monto);
}

function cambiarVista(vista) {
    vistaActual = vista;
    document.getElementById("btn-curso").classList.toggle("active", vista === "curso");
    document.getElementById("btn-historico").classList.toggle("active", vista === "historico");
    
    const select = document.getElementById("select-mes-historico");
    select.style.display = vista === "historico" ? "inline-block" : "none";

    procesarDashboard();
}

function poblarSelectorHistorico() {
    const select = document.getElementById("select-mes-historico");
    select.innerHTML = "";
    
    // Extraer meses únicos en formato YYYY-MM
    const meses = [...new Set(todosLosDatos.map(r => {
        const partes = r["Fecha (c3)"].split("-");
        return `${partes[2]}-${partes[1]}`;
    }))].sort().reverse();

    // El primer mes de la lista es el en curso, el resto son históricos
    const mesesHistoricos = meses.slice(1);
    mesesHistoricos.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.innerText = m;
        select.appendChild(opt);
    });
}

function procesarDashboard() {
    let datosFiltrados = [];
    const fechaActual = new Date();
    const mesActualStr = `${fechaActual.getFullYear()}-${String(fechaActual.getMonth() + 1).padStart(2, '0')}`;

    if (vistaActual === "curso") {
        document.getElementById("label-periodo").innerText = `Mostrando: Mes en Curso (${mesActualStr})`;
        datosFiltrados = todosLosDatos.filter(r => {
            const p = r["Fecha (c3)"].split("-");
            return `${p[2]}-${p[1]}` === mesActualStr;
        });
    } else {
        const mesSel = document.getElementById("select-mes-historico").value;
        document.getElementById("label-periodo").innerText = `Mostrando Histórico: ${mesSel || "Sin Selección"}`;
        datosFiltrados = todosLosDatos.filter(r => {
            const p = r["Fecha (c3)"].split("-");
            return `${p[2]}-${p[1]}` === mesSel;
        });
    }

    renderizarMetricasYGrafico(datosFiltrados);
}

function filtrarPorMesHistorico() {
    procesarDashboard();
}

function renderizarMetricasYGrafico(datos) {
    let totalVta = 0, totalSB = 0, totalTarjetas = 0, totalCtasCtes = 0, totalMP = 0;
    let ventasPorDia = {};
    let rankingPersonas = {};

    datos.forEach(r => {
        const vta = parsearMonto(r["Vta Total (R11)"]);
        const sb = parsearMonto(r["Shell Box(R6)"]);
        const tarj = parsearMonto(r["Tarjetas(R9)"]);
        const ctas = parsearMonto(r["Ctas/ctes(R8)"]);
        const mp = parsearMonto(r["Mercado PAgo(R7)"]);

        totalVta += vta;
        totalSB += sb;
        totalTarjetas += tarj;
        totalCtasCtes += ctas;
        totalMP += mp;

        // Agrupar venta diaria para gráfico
        const fecha = r["Fecha (c3)"];
        ventasPorDia[fecha] = (ventasPorDia[fecha] || 0) + vta;

        // Distribución equitativa de Shell Box entre Cajero 1 y Cajero 2
        const c1 = r["Cajero1(f3)"] ? r["Cajero1(f3)"].trim() : "";
        const c2 = r["Cajero2(f4)"] ? r["Cajero2(f4)"].trim() : "";
        const cajerosValidos = [c1, c2].filter(c => c && c !== "0");

        if (cajerosValidos.length > 0) {
            const parteMonto = sb / cajerosValidos.length;
            cajerosValidos.forEach(c => {
                rankingPersonas[c] = (rankingPersonas[c] || 0) + parteMonto;
            });
        }
    });

    // Calcular KPIs
    const diasUnicos = Object.keys(ventasPorDia).length || 1;
    const promedioDiario = totalVta / diasUnicos;
    const proyeccionMes = promedioDiario * 30;

    document.getElementById("kpi-vta-acum").innerText = formatearARS(totalVta);
    document.getElementById("kpi-vta-proy").innerText = formatearARS(proyeccionMes);
    document.getElementById("kpi-vta-prom").innerText = formatearARS(promedioDiario);
    document.getElementById("kpi-sb").innerText = formatearARS(totalSB);
    document.getElementById("kpi-tarjetas").innerText = formatearARS(totalTarjetas);
    document.getElementById("kpi-ctasctes").innerText = formatearARS(totalCtasCtes);
    document.getElementById("kpi-mp").innerText = formatearARS(totalMP);

    // Ranking de Personal
    const rankingEl = document.getElementById("ranking-cajeros");
    rankingEl.innerHTML = "";
    Object.entries(rankingPersonas)
        .sort((a, b) => b[1] - a[1])
        .forEach(([nombre, monto], idx) => {
            rankingEl.innerHTML += `
                <div class="ranking-item">
                    <span class="ranking-name">${idx + 1}. ${nombre}</span>
                    <span class="ranking-val">${formatearARS(monto)}</span>
                </div>
            `;
        });

    // Gráfico Chart.js
    renderizarGrafico(Object.keys(ventasPorDia), Object.values(ventasPorDia));
}

function renderizarGrafico(labels, data) {
    const ctx = document.getElementById("chartEvolucion").getContext("2d");
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Venta Diaria ($)",
                data: data,
                borderColor: "#f59e0b",
                backgroundColor: "rgba(245, 158, 11, 0.1)",
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: "#9ca3af" }, grid: { color: "#1f293d" } },
                y: { ticks: { color: "#9ca3af" }, grid: { color: "#1f293d" } }
            }
        }
    });
}