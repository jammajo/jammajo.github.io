// Configuracion por defecto
const DEFAULT_CONFIG = {
  host: 'broker.emqx.io',
  port: 8084,
  path: '/mqtt',
  topicData: 'bioreactor/platano/datos',
  topicCmd: 'bioreactor/platano/control'
};

// Cargar configuracion de localStorage o usar valores por defecto
let config = JSON.parse(localStorage.getItem('bioreactor_mqtt_config')) || { ...DEFAULT_CONFIG };

// Variables de estado
let mqttClient = null;
let currentMode = 'auto'; // 'auto' o 'manual'
let manualAction = 'stop'; // 'cool', 'stop', 'heat'
let targetTemp = 31.0;

// Elementos del DOM
const statusBadge = document.getElementById('status-badge');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const logBox = document.getElementById('log-box');

const valTemp = document.getElementById('val-temp');
const valPh = document.getElementById('val-ph');
const valPress = document.getElementById('val-press');
const valPeltierStatus = document.getElementById('val-peltier-status');
const valPeltierPwm = document.getElementById('val-peltier-pwm');
const peltierIconBox = document.getElementById('peltier-icon-box');
const peltierModeBadge = document.getElementById('peltier-mode-badge');
const peltierActionText = document.getElementById('peltier-action-text');

const inputSetpoint = document.getElementById('input-setpoint');
const dispSetpoint = document.getElementById('disp-setpoint');
const btnModeAuto = document.getElementById('btn-mode-auto');
const btnModeManual = document.getElementById('btn-mode-manual');
const manualControls = document.getElementById('manual-controls');
const btnActCool = document.getElementById('btn-act-cool');
const btnActStop = document.getElementById('btn-act-stop');
const btnActHeat = document.getElementById('btn-act-heat');
const btnSendCmd = document.getElementById('btn-send-cmd');

// Modal elementos
const btnConfig = document.getElementById('btn-config');
const btnCloseModal = document.getElementById('btn-close-modal');
const modalConfig = document.getElementById('modal-config');
const cfgHost = document.getElementById('cfg-host');
const cfgPort = document.getElementById('cfg-port');
const cfgPath = document.getElementById('cfg-path');
const cfgTopicData = document.getElementById('cfg-topic-data');
const cfgTopicCmd = document.getElementById('cfg-topic-cmd');
const btnSaveConnect = document.getElementById('btn-save-connect');
const btnClearLogs = document.getElementById('btn-clear-logs');

// Funcion de Logs
function addLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  if (type === 'error') line.className = 'text-rose-400';
  else if (type === 'success') line.className = 'text-emerald-400';
  else if (type === 'warn') line.className = 'text-amber-400';
  else line.className = 'text-slate-400';

  line.textContent = `[${time}] ${msg}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

btnClearLogs.addEventListener('click', () => {
  logBox.innerHTML = '';
});

// Configuracion de Chart.js
const maxDataPoints = 30;

// Grafico 1: Temperatura y pH
const ctxTempPh = document.getElementById('chart-temp-ph').getContext('2d');
const chartTempPh = new Chart(ctxTempPh, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Temperatura (°C)',
        data: [],
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
        yAxisID: 'yTemp',
        tension: 0.3,
        fill: true,
        pointRadius: 2
      },
      {
        label: 'pH',
        data: [],
        borderColor: '#22d3ee',
        backgroundColor: 'transparent',
        yAxisID: 'yPh',
        tension: 0.3,
        borderDash: [4, 4],
        pointRadius: 2
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
    },
    scales: {
      x: {
        grid: { color: '#334155' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      yTemp: {
        type: 'linear',
        display: true,
        position: 'left',
        min: 20,
        max: 45,
        grid: { color: '#334155' },
        ticks: { color: '#fbbf24', font: { size: 10 } },
        title: { display: true, text: '°C', color: '#fbbf24' }
      },
      yPh: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 2,
        max: 9,
        grid: { drawOnChartArea: false },
        ticks: { color: '#22d3ee', font: { size: 10 } },
        title: { display: true, text: 'pH', color: '#22d3ee' }
      }
    }
  }
});

// Grafico 2: Presion
const ctxPress = document.getElementById('chart-press').getContext('2d');
const chartPress = new Chart(ctxPress, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Presion (hPa)',
        data: [],
        borderColor: '#c084fc',
        backgroundColor: 'rgba(192, 132, 252, 0.15)',
        tension: 0.3,
        fill: true,
        pointRadius: 2
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
    },
    scales: {
      x: {
        grid: { color: '#334155' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      y: {
        grid: { color: '#334155' },
        ticks: { color: '#c084fc', font: { size: 10 } }
      }
    }
  }
});

// Conectar con Broker MQTT via WebSockets
function connectMQTT() {
  if (mqttClient) {
    try { mqttClient.end(true); } catch (e) {}
  }

  statusBadge.className = 'flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30';
  statusDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
  statusText.textContent = 'Conectando...';

  const brokerUrl = `wss://${config.host}:${config.port}${config.path}`;
  const clientId = 'bioreactor_web_' + Math.random().toString(16).substr(2, 8);

  addLog(`Intentando conectar a ${brokerUrl}...`);

  try {
    mqttClient = mqtt.connect(brokerUrl, {
      clientId: clientId,
      clean: true,
      connectTimeout: 7000,
      reconnectPeriod: 5000
    });

    mqttClient.on('connect', () => {
      statusBadge.className = 'flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      statusText.textContent = 'En Linea';
      addLog(`Conectado al broker MQTT con ID: ${clientId}`, 'success');

      // Suscribirse a telemetria del ESP32
      mqttClient.subscribe(config.topicData, (err) => {
        if (!err) {
          addLog(`Suscrito exitosamente a: ${config.topicData}`, 'success');
        } else {
          addLog(`Error suscribiendo: ${err.message}`, 'error');
        }
      });
    });

    mqttClient.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        processData(payload);
      } catch (err) {
        addLog(`Datos recibidos: ${message.toString()}`, 'warn');
      }
    });

    mqttClient.on('error', (err) => {
      addLog(`Error MQTT: ${err.message}`, 'error');
    });

    mqttClient.on('close', () => {
      statusBadge.className = 'flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30';
      statusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      statusText.textContent = 'Desconectado';
    });

  } catch (err) {
    addLog(`Fallo al iniciar conexion: ${err.message}`, 'error');
  }
}

// Procesar datos recibidos del ESP32
function processData(data) {
  const timeLabel = new Date().toLocaleTimeString();

  // Temperatura
  if (data.temp !== undefined) {
    valTemp.textContent = Number(data.temp).toFixed(1);
    const tempAlert = document.getElementById('temp-alert');
    if (data.temp < 28 || data.temp > 35) {
      tempAlert.classList.remove('hidden');
    } else {
      tempAlert.classList.add('hidden');
    }
  }

  // pH
  if (data.ph !== undefined) {
    valPh.textContent = Number(data.ph).toFixed(2);
    const phAlert = document.getElementById('ph-alert');
    if (data.ph < 4.0 || data.ph > 6.0) {
      phAlert.classList.remove('hidden');
    } else {
      phAlert.classList.add('hidden');
    }
  }

  // Presion
  if (data.pres !== undefined) {
    valPress.textContent = Number(data.pres).toFixed(1);
    const pressStatus = document.getElementById('press-status');
    if (data.pres > 1050) {
      pressStatus.textContent = 'Sobrepresion';
      pressStatus.className = 'text-rose-400 font-bold';
    } else {
      pressStatus.textContent = 'Normal';
      pressStatus.className = 'text-slate-400 font-medium';
    }
  }

  // Estado Peltier
  if (data.peltier !== undefined) {
    valPeltierStatus.textContent = data.peltier;
    valPeltierPwm.textContent = `(${data.pwm !== undefined ? data.pwm : 0}%)`;

    if (data.peltier === 'COOLING' || data.peltier === 'ENFRIANDO') {
      peltierIconBox.className = 'p-3 bg-blue-500/20 text-blue-400 rounded-xl transition animate-pulse-slow';
      peltierActionText.textContent = 'Enfriando Biorreactor';
      peltierActionText.className = 'text-blue-400 font-semibold';
    } else if (data.peltier === 'HEATING' || data.peltier === 'CALENTANDO') {
      peltierIconBox.className = 'p-3 bg-rose-500/20 text-rose-400 rounded-xl transition animate-pulse-slow';
      peltierActionText.textContent = 'Calentando Biorreactor';
      peltierActionText.className = 'text-rose-400 font-semibold';
    } else {
      peltierIconBox.className = 'p-3 bg-slate-700 text-slate-400 rounded-xl transition';
      peltierActionText.textContent = 'En reposo';
      peltierActionText.className = 'text-emerald-400';
    }
  }

  if (data.mode) {
    peltierModeBadge.textContent = `Modo: ${data.mode}`;
  }

  // Actualizar Graficos
  addDataToChart(chartTempPh, timeLabel, [data.temp, data.ph]);
  addDataToChart(chartPress, timeLabel, [data.pres]);
}

function addDataToChart(chart, label, dataArray) {
  chart.data.labels.push(label);
  dataArray.forEach((val, idx) => {
    chart.data.datasets[idx].data.push(val);
  });

  if (chart.data.labels.length > maxDataPoints) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(ds => ds.data.shift());
  }
  chart.update('none');
}

// UI Event Handlers
inputSetpoint.addEventListener('input', (e) => {
  targetTemp = parseFloat(e.target.value);
  dispSetpoint.textContent = `${targetTemp.toFixed(1)} °C`;
});

btnModeAuto.addEventListener('click', () => {
  currentMode = 'auto';
  btnModeAuto.className = 'py-2 px-3 rounded-xl text-xs font-bold transition bg-emerald-600 text-white shadow-lg shadow-emerald-900/30';
  btnModeManual.className = 'py-2 px-3 rounded-xl text-xs font-bold transition bg-slate-700 text-slate-300 hover:bg-slate-600';
  manualControls.classList.add('hidden');
});

btnModeManual.addEventListener('click', () => {
  currentMode = 'manual';
  btnModeManual.className = 'py-2 px-3 rounded-xl text-xs font-bold transition bg-emerald-600 text-white shadow-lg shadow-emerald-900/30';
  btnModeAuto.className = 'py-2 px-3 rounded-xl text-xs font-bold transition bg-slate-700 text-slate-300 hover:bg-slate-600';
  manualControls.classList.remove('hidden');
});

function highlightManualBtn(activeBtn) {
  [btnActCool, btnActStop, btnActHeat].forEach(b => {
    b.classList.remove('ring-2', 'ring-white');
  });
  activeBtn.classList.add('ring-2', 'ring-white');
}

btnActCool.addEventListener('click', () => { manualAction = 'cool'; highlightManualBtn(btnActCool); });
btnActStop.addEventListener('click', () => { manualAction = 'stop'; highlightManualBtn(btnActStop); });
btnActHeat.addEventListener('click', () => { manualAction = 'heat'; highlightManualBtn(btnActHeat); });

// Enviar comandos al ESP32
btnSendCmd.addEventListener('click', () => {
  if (!mqttClient || !mqttClient.connected) {
    alert('No estas conectado al broker MQTT');
    return;
  }

  const payload = {
    setpoint: targetTemp,
    mode: currentMode.toUpperCase(),
    action: currentMode === 'manual' ? manualAction.toUpperCase() : 'AUTO'
  };

  const jsonStr = JSON.stringify(payload);
  mqttClient.publish(config.topicCmd, jsonStr, { qos: 1 }, (err) => {
    if (!err) {
      addLog(`Comando enviado al ESP32: ${jsonStr}`, 'success');
    } else {
      addLog(`Error al enviar comando: ${err.message}`, 'error');
    }
  });
});

// Modal Configuracion
btnConfig.addEventListener('click', () => {
  cfgHost.value = config.host;
  cfgPort.value = config.port;
  cfgPath.value = config.path;
  cfgTopicData.value = config.topicData;
  cfgTopicCmd.value = config.topicCmd;
  modalConfig.classList.remove('hidden');
});

btnCloseModal.addEventListener('click', () => {
  modalConfig.classList.add('hidden');
});

btnSaveConnect.addEventListener('click', () => {
  config.host = cfgHost.value.trim();
  config.port = parseInt(cfgPort.value.trim(), 10);
  config.path = cfgPath.value.trim();
  config.topicData = cfgTopicData.value.trim();
  config.topicCmd = cfgTopicCmd.value.trim();

  localStorage.setItem('bioreactor_mqtt_config', JSON.stringify(config));
  modalConfig.classList.add('hidden');
  addLog('Configuracion guardada.', 'info');
  connectMQTT();
});

// Iniciar al cargar
window.addEventListener('DOMContentLoaded', () => {
  connectMQTT();
});
