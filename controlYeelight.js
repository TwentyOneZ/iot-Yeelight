require('dotenv').config();

const mqtt = require('mqtt');
const {
  ligarDispositivo,
  desligarDispositivo,
  obterStatusTomada,
} = require('./tuyaController');
const { iniciarTuyaMessageService } = require('./tuyaMessageService');
const { Yeelight } = require('yeelight-node');

const TOPICO_TOMADA = 'iot/tomada';
const TOPICO_LAMPADA = 'iot/lampadaQ';
const TOPICO_ESTADOS = 'iot/states';

let statusTomada = false;
let statusLampada = false;
let tuyaMessageClient = null;

const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL);
const lamp = new Yeelight({ ip: process.env.YEELIGHT_IP, port: +process.env.YEELIGHT_PORT });

function publicarEstadoTomada(ligada, origem = 'local', forcar = false) {
  const mudou = statusTomada !== ligada;
  statusTomada = ligada;

  if (mudou || forcar) {
    mqttClient.publish(TOPICO_ESTADOS, `tomada ${ligada ? 'on' : 'off'}`);
    console.log(`Tomada ${ligada ? 'on' : 'off'} publicada via ${origem}`);
  }
}

function publicarEstadoLampada(ligada) {
  statusLampada = ligada;
  mqttClient.publish(TOPICO_ESTADOS, `lampada ${ligada ? 'on' : 'off'}`);
}

async function publicarEstadosIniciais() {
  try {
    console.log('Yeelight - solicitando estado...');
    let resp = await lamp.get_prop('power');

    if (typeof resp === 'string') {
      resp = JSON.parse(resp);
    }

    const power = resp && Array.isArray(resp.result) ? resp.result[0] : undefined;
    console.log('Lampada:', power);
    publicarEstadoLampada(power === 'on' || power === '1');
  } catch (e) {
    console.error('Yeelight erro:', e);
  }

  try {
    console.log('Tomada Tuya - solicitando status inicial...');
    const ligada = await obterStatusTomada();
    console.log('Tomada:', ligada);
    publicarEstadoTomada(ligada, 'estado inicial', true);
  } catch (e) {
    console.error('Tuya erro:', e);
  }
}

function iniciarListenerTuya() {
  if (tuyaMessageClient) {
    return;
  }

  tuyaMessageClient = iniciarTuyaMessageService({
    onSwitchChange: async ({ ligada }) => {
      publicarEstadoTomada(ligada, 'Tuya Message Service');
    },
  });
}

mqttClient.on('connect', () => {
  console.log('Conectado ao broker MQTT');
  mqttClient.subscribe([TOPICO_TOMADA, TOPICO_LAMPADA], err => {
    if (err) console.error('Erro ao se inscrever:', err);
    else console.log(`Inscrito em ${TOPICO_TOMADA}, ${TOPICO_LAMPADA}`);
  });

  publicarEstadosIniciais();
  iniciarListenerTuya();
});

mqttClient.on('message', async (topic, messageBuffer) => {
  const msg = messageBuffer.toString().trim().toLowerCase();

  if (topic === TOPICO_TOMADA) {
    console.log(`[TOMADA] Mensagem recebida: ${msg}`);
    try {
      if (msg === 'on' && !statusTomada) {
        await ligarDispositivo();
        publicarEstadoTomada(true, 'comando MQTT');
        console.log('Dispositivo LIGADO');
      } else if (msg === 'off' && statusTomada) {
        await desligarDispositivo();
        publicarEstadoTomada(false, 'comando MQTT');
        console.log('Dispositivo DESLIGADO');
      } else {
        console.log('Comando ignorado (sem mudanca de estado)');
      }
    } catch (error) {
      console.error('Erro ao processar comando do dispositivo:', error);
    }
  } else if (topic === TOPICO_LAMPADA) {
    console.log(`[LAMPADA] Mensagem recebida: ${msg}`);
    try {
      if (msg === 'on') {
        await lamp.set_power('on');
        publicarEstadoLampada(true);
        console.log('Lampada LIGADA');
      } else if (msg === 'off') {
        await lamp.set_power('off');
        publicarEstadoLampada(false);
        console.log('Lampada DESLIGADA');
      } else if (msg.startsWith('color')) {
        const [, r, g, b] = msg.split(' ');
        await lamp.set_rgb([+r, +g, +b]);
      } else if (msg.startsWith('bright')) {
        const [, val] = msg.split(' ');
        await lamp.set_bright(+val);
      } else if (msg.startsWith('temp')) {
        const [, val] = msg.split(' ');
        await lamp.set_ct_abx(+val);
      } else {
        console.log('Comando invalido para lampada');
      }
    } catch (error) {
      console.error('Erro na lampada:', error);
    }
  }
});
