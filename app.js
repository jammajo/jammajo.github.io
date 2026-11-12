/* =========================================================================
 * BIORREACTOR DE FERMENTACIÓN DE ETANOL - CLIENTE MQTT WEBSOCKETS
 * ========================================================================= */

// Configuración Broker MQTT vía WebSockets Seguros (WSS)
const MQTT_CONFIG = {
  host: "broker.emqx.io",
  port: 8084, // Puerto WebSockets SSL/TLS de EMQX
  path: "/mqtt",
  topics: {
    telemetry: "bioreactor/etanol/telemetria",
    status: "bioreactor/etanol/status",
    cmdRpm: "bioreactor/etanol/cmd/rpm"
  }
};

let mqttClient = null;
let chart = null;
const MAX_CHART_POINTS = 25;

// Elementos del DOM
const elValTemp = document.getElementById("val-temperatura");
const elTempAlert = document.getElementById("temp-alert");
const elValPeltier = document.getElementById("val-peltier");
const elPeltierIcon = document.getElementById("peltier-icon");
const elPeltierDesc = document.getElementById("peltier-desc");
const elValMotor = document.getElementById("val-motor");
const elMotorIcon = document.getElementById("motor-icon");
const elBadgeMqtt = document.getElementById("badge-mqtt");
const elBadgeEsp32 = document.getElementById("badge-esp32");
const elTxtLastUpdate = document.getElementById("txt-last-update");
const elLogsConsole = document.getElementById("logs-console");
const btnClearLogs = document.getElementById("btn-clear-logs");

// Controles RPM
const sliderRpm = document.getElementById("slider-rpm");
const rpmDisplay = document.getElementById("rpm-display");
const btnSetRpm = document.getElementById("btn-set-rpm");
const btnStopMotor = document.getElementById("btn-stop-motor");
const rpmFeedback = document.getElementById("rpm-feedback");

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  initChart();
  conectarMQTT();

  btnClearLogs.addEventListener("click", () => {
    elLogsConsole.innerHTML = "";
  });

  // Actualizar indicador numérico al mover el slider
  sliderRpm.addEventListener("input", (e) => {
    rpmDisplay.textContent = e.target.value;
  });

  // Botón Aplicar RPM
  btnSetRpm.addEventListener("click", () => {
    enviarComandoRPM(parseInt(sliderRpm.value));
  });

  // Botón Parar Motor
  btnStopMotor.addEventListener("click", () => {
    sliderRpm.value = 0;
    rpmDisplay.textContent = "0";
    enviarComandoRPM(0);
  });
});

// Enviar comando MQTT para ajustar RPM
function enviarComandoRPM(rpm) {
  if (!mqttClient || !mqttClient.isConnected()) {
    log("[ERROR] No hay conexión MQTT para enviar comando.", "err");
    alert("No hay conexión con el Broker MQTT.");
    return;
  }

  const payload = JSON.stringify({ rpm: rpm });
  const message = new Paho.MQTT.Message(payload);
  message.destinationName = MQTT_CONFIG.topics.cmdRpm;
  message.qos = 1;
  mqttClient.send(message);

  log(`[CMD ENVIADO] Ajustar RPM a ${rpm}`, "system");
  rpmFeedback.textContent = `Enviando consigna: ${rpm} RPM...`;
}

// Inicializar Gráfica Chart.js
function initChart() {
  const ctx = document.getElementById("tempChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Temperatura (°C)",
          data: [],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.1)",
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          pointRadius: 3
        },
        {
          label: "Límite Máx (32°C)",
          data: [],
          borderColor: "rgba(239, 68, 68, 0.6)",
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        },
        {
          label: "Objetivo (30°C)",
          data: [],
          borderColor: "rgba(34, 197, 94, 0.6)",
          borderDash: [3, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        },
        {
          label: "Límite Mín (28°C)",
          data: [],
          borderColor: "rgba(59, 130, 246, 0.6)",
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 24,
          max: 36,
          grid: { color: "#30363d" },
          ticks: { color: "#8b949e" }
        },
        x: {
          grid: { color: "#21262d" },
          ticks: { color: "#8b949e", maxRotation: 0 }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#e6edf3", boxWidth: 14 }
        }
      }
    }
  });
}

// Conexión MQTT sobre WebSockets con Paho MQTT
function conectarMQTT() {
  const clientId = "WebClient_Bioreactor_" + Math.random().toString(16).substr(2, 8);
  log("[WSS] Conectando a " + MQTT_CONFIG.host + ":" + MQTT_CONFIG.port + "...", "system");

  mqttClient = new Paho.MQTT.Client(
    MQTT_CONFIG.host,
    MQTT_CONFIG.port,
    MQTT_CONFIG.path,
    clientId
  );

  mqttClient.onConnectionLost = onConnectionLost;
  mqttClient.onMessageArrived = onMessageArrived;

  mqttClient.connect({
    useSSL: true,
    timeout: 5,
    onSuccess: onConnectSuccess,
    onFailure: onConnectFailure
  });
}

function onConnectSuccess() {
  log("[WSS] Conectado exitosamente al broker MQTT.", "system");
  elBadgeMqtt.textContent = "WSS Conectado";
  elBadgeMqtt.className = "badge badge-connected";

  // Suscribirse a los tópicos
  mqttClient.subscribe(MQTT_CONFIG.topics.telemetry);
  mqttClient.subscribe(MQTT_CONFIG.topics.status);
  log("[MQTT] Suscrito a los canales del biorreactor.", "system");
}

function onConnectFailure(err) {
  log("[WSS ERROR] Falló la conexión: " + err.errorMessage, "err");
  elBadgeMqtt.textContent = "WSS Desconectado";
  elBadgeMqtt.className = "badge badge-disconnected";
  setTimeout(conectarMQTT, 5000); // Reintento automático
}

function onConnectionLost(response) {
  log("[WSS] Conexión perdida: " + response.errorMessage, "err");
  elBadgeMqtt.textContent = "WSS Desconectado";
  elBadgeMqtt.className = "badge badge-disconnected";
  setTimeout(conectarMQTT, 4000);
}

// Manejo de mensajes entrantes
function onMessageArrived(message) {
  const topic = message.destinationName;
  const payloadStr = message.payloadString;

  if (topic === MQTT_CONFIG.topics.status) {
    try {
      const data = JSON.parse(payloadStr);
      if (data.status === "online") {
        elBadgeEsp32.textContent = "ESP32 Online";
        elBadgeEsp32.className = "badge badge-online";
      } else {
        elBadgeEsp32.textContent = "ESP32 Offline";
        elBadgeEsp32.className = "badge badge-offline";
      }
    } catch (e) {}
    return;
  }

  if (topic === MQTT_CONFIG.topics.telemetry) {
    log(payloadStr, "data");
    elBadgeEsp32.textContent = "ESP32 Online";
    elBadgeEsp32.className = "badge badge-online";

    try {
      const data = JSON.parse(payloadStr);
      actualizarDashboard(data);
    } catch (err) {
      log("[PARSE ERROR] JSON no válido: " + payloadStr, "err");
    }
  }
}

// Actualizar la interfaz gráfica
function actualizarDashboard(data) {
  const ahora = new Date();
  const timeStr = ahora.toTimeString().split(" ")[0];
  elTxtLastUpdate.textContent = "Última actualización: " + timeStr;

  // 1. Temperatura
  const temp = parseFloat(data.t);
  elValTemp.textContent = isNaN(temp) ? "--.-" : temp.toFixed(1);

  if (temp >= 28.0 && temp <= 32.0) {
    elTempAlert.textContent = "ÓPTIMO PARA LEVADURAS (28°C - 32°C)";
    elTempAlert.className = "temp-alert alert-optimal";
  } else if (temp > 32.0) {
    elTempAlert.textContent = "ALTO: RIESGO DE INHIBICIÓN/MUERTE TÉRMICA";
    elTempAlert.className = "temp-alert alert-danger";
  } else {
    elTempAlert.textContent = "BAJO: TASA METABÓLICA REDUCIDA";
    elTempAlert.className = "temp-alert alert-warning";
  }

  // 2. Peltier (0: Apagada, 1: Enfriando, 2: Calentando)
  const peltierState = parseInt(data.p);
  if (peltierState === 1) {
    elValPeltier.textContent = "Enfriando";
    elValPeltier.style.color = "#38bdf8";
    elPeltierIcon.textContent = "❄️";
    elPeltierDesc.textContent = "Disipando calor generado por la fermentación";
  } else if (peltierState === 2) {
    elValPeltier.textContent = "Calentando";
    elValPeltier.style.color = "#f97316";
    elPeltierIcon.textContent = "🔥";
    elPeltierDesc.textContent = "Calentando caldo para reactivar metabolismo";
  } else {
    elValPeltier.textContent = "Apagada";
    elValPeltier.style.color = "#8b949e";
    elPeltierIcon.textContent = "💤";
    elPeltierDesc.textContent = "Temperatura dentro de rango seguro";
  }

  // 3. Motor NEMA 17 (0: Reposo, 1: Agitando)
  const motorState = parseInt(data.m);
  const currentRpm = data.rpm !== undefined ? parseInt(data.rpm) : 0;

  if (motorState === 1 && currentRpm > 0) {
    elValMotor.textContent = `Agitando (${currentRpm} RPM)`;
    elValMotor.style.color = "#22c55e";
    elMotorIcon.classList.add("rotating");
    // Ajustar velocidad de giro del icono según RPM
    const duracionGiro = Math.max(0.4, (60 / currentRpm));
    elMotorIcon.style.animationDuration = `${duracionGiro.toFixed(2)}s`;
    rpmFeedback.textContent = `RPM confirmado en reactor: ${currentRpm} RPM`;
  } else {
    elValMotor.textContent = currentRpm === 0 ? "Detenido (0 RPM)" : "Reposo Térmico";
    elValMotor.style.color = "#8b949e";
    elMotorIcon.classList.remove("rotating");
    rpmFeedback.textContent = currentRpm === 0 
      ? "Motor apagado por consigna." 
      : `En pausa de ciclo (consigna: ${currentRpm} RPM)`;
  }

  // 4. Actualizar Gráfica
  if (chart && !isNaN(temp)) {
    if (chart.data.labels.length >= MAX_CHART_POINTS) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
      chart.data.datasets[1].data.shift();
      chart.data.datasets[2].data.shift();
      chart.data.datasets[3].data.shift();
    }

    chart.data.labels.push(timeStr);
    chart.data.datasets[0].data.push(temp);
    chart.data.datasets[1].data.push(32.0); // Línea máxima
    chart.data.datasets[2].data.push(30.0); // Meta
    chart.data.datasets[3].data.push(28.0); // Línea mínima
    chart.update("none"); // Actualizar sin animaciones bruscas
  }
}

// Log en consola visual
function log(msg, type = "data") {
  const entry = document.createElement("div");
  entry.className = "log-entry " + type;
  const time = new Date().toTimeString().split(" ")[0];
  entry.textContent = `[${time}] ${msg}`;
  elLogsConsole.appendChild(entry);
  elLogsConsole.scrollTop = elLogsConsole.scrollHeight;
}
