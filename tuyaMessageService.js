require('dotenv').config();

const TuyaWebsocketModule = require('message-subscription-websocket/dist');

const TuyaWebsocket = TuyaWebsocketModule.default || TuyaWebsocketModule;

const DEFAULT_REGION = 'US';
const DEFAULT_ENV = 'PROD';

const REGION_URLS = {
  CN: 'wss://mqe.tuyacn.com:8285/',
  US: 'wss://mqe.tuyaus.com:8285/',
  EU: 'wss://mqe.tuyaeu.com:8285/',
  IN: 'wss://mqe.tuyain.com:8285/',
  SG: 'wss://mqe-sg.iotbing.com:8285/',
};

function normalizarBooleano(valor) {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'string') return valor.toLowerCase() === 'true' || valor === '1';
  return undefined;
}

function obterUrlTuyaMessageService() {
  if (process.env.TUYA_MESSAGE_URL) {
    return process.env.TUYA_MESSAGE_URL;
  }

  const region = (process.env.TUYA_MESSAGE_REGION || DEFAULT_REGION).toUpperCase();
  const url = REGION_URLS[region];

  if (!url) {
    throw new Error(
      `TUYA_MESSAGE_REGION invalida: ${region}. Use uma destas: ${Object.keys(REGION_URLS).join(', ')}`
    );
  }

  return url;
}

function obterEnvTuyaMessageService() {
  const env = (process.env.TUYA_MESSAGE_ENV || DEFAULT_ENV).toUpperCase();

  if (!TuyaWebsocket.env[env]) {
    throw new Error('TUYA_MESSAGE_ENV invalido. Use PROD ou TEST.');
  }

  return TuyaWebsocket.env[env];
}

function extrairEventoTuya(message) {
  const payload = message && message.payload;
  const data = payload && (payload.data || payload.bizData);

  if (!data || data.devId !== process.env.TUYA_DEVICE_ID) {
    return null;
  }

  const status = Array.isArray(data.status)
    ? data.status
    : Array.isArray(data.properties)
      ? data.properties
      : [];

  const switchStatus = status.find(item => item.code === 'switch_1' || item.code === 'switch');

  if (!switchStatus) {
    return null;
  }

  const ligada = normalizarBooleano(switchStatus.value);

  if (typeof ligada !== 'boolean') {
    return null;
  }

  return {
    deviceId: data.devId,
    code: switchStatus.code,
    ligada,
    timestamp: switchStatus.t || switchStatus.time || data.t || payload.t || payload.ts || Date.now(),
    raw: message,
  };
}

function iniciarTuyaMessageService({ onSwitchChange }) {
  if (process.env.TUYA_MESSAGE_ENABLED === 'false') {
    console.log('Tuya Message Service desabilitado por TUYA_MESSAGE_ENABLED=false');
    return null;
  }

  const accessId = process.env.TUYA_ACCESS_KEY;
  const accessKey = process.env.TUYA_SECRET_KEY;

  if (!accessId || !accessKey || !process.env.TUYA_DEVICE_ID) {
    console.warn('Tuya Message Service nao iniciado: TUYA_ACCESS_KEY, TUYA_SECRET_KEY ou TUYA_DEVICE_ID ausente.');
    return null;
  }

  const client = new TuyaWebsocket({
    accessId,
    accessKey,
    url: obterUrlTuyaMessageService(),
    env: obterEnvTuyaMessageService(),
    maxRetryTimes: Number(process.env.TUYA_MESSAGE_MAX_RETRIES || 100),
    retryTimeout: Number(process.env.TUYA_MESSAGE_RETRY_TIMEOUT_MS || 1000),
    timeout: Number(process.env.TUYA_MESSAGE_KEEPALIVE_MS || 30000),
  });

  client.open(() => {
    console.log('Tuya Message Service conectado');
  });

  client.reconnect(() => {
    console.log('Tuya Message Service reconectado');
  });

  client.close((...args) => {
    console.warn('Tuya Message Service desconectado', ...args);
  });

  client.error((...args) => {
    const error = args[args.length - 1];
    console.error('Erro no Tuya Message Service:', error);
  });

  client.message(async (_ws, message) => {
    try {
      const evento = extrairEventoTuya(message);

      if (evento) {
        await onSwitchChange(evento);
      }

      client.ackMessage(message.messageId);
    } catch (error) {
      console.error('Erro ao processar mensagem Tuya:', error);
    }
  });

  client.start();
  return client;
}

module.exports = {
  iniciarTuyaMessageService,
  extrairEventoTuya,
};
