require('dotenv').config();

const { TuyaContext } = require('@tuya/tuya-connector-nodejs');

const context = new TuyaContext({
  baseUrl: process.env.TUYA_API_BASE_URL || 'https://openapi.tuyaus.com',
  accessKey: process.env.TUYA_ACCESS_KEY,
  secretKey: process.env.TUYA_SECRET_KEY,
});

const device_id = process.env.TUYA_DEVICE_ID;

async function ligarDispositivo() {
  return context.request({
    path: `/v1.0/iot-03/devices/${device_id}/commands`,
    method: 'POST',
    body: { commands: [{ code: 'switch_1', value: true }] },
  });
}

async function desligarDispositivo() {
  return context.request({
    path: `/v1.0/iot-03/devices/${device_id}/commands`,
    method: 'POST',
    body: { commands: [{ code: 'switch_1', value: false }] },
  });
}

async function obterStatusEnergia() {
  const response = await context.request({
    path: `/v1.0/iot-03/devices/${device_id}/status`,
    method: 'GET',
  });

  // 1. Verifica sucesso
  if (!response.success) {
    throw new Error(
      `Tuya API error ${response.code || ''}: ${response.msg || 'Unknown'}`
    );
  }

  // 2. Garante que result seja um array, mesmo que vazio
  const lista = Array.isArray(response.result) ? response.result : [];

  // 3. Converte o array em objeto  {code: value}
  const dados = lista.reduce((acc, item) => {
    acc[item.code] = item.value;
    return acc;
  }, {});

  return {
    tensao: (dados.cur_voltage ?? 0) / 10,
    corrente: (dados.cur_current ?? 0) / 1000,
    potencia: (dados.cur_power ?? 0) / 10,
  };
}

async function obterStatusTomada() {
  const response = await context.request({
    path: `/v1.0/iot-03/devices/${device_id}/status`,
    method: 'GET',
  });

  if (!response.success) {
    throw new Error(
      `Tuya API error ${response.code || ''}: ${response.msg || 'Unknown'}`
    );
  }

  const lista = Array.isArray(response.result) ? response.result : [];
  const dp = lista.find(item => item.code === 'switch_1');
  return dp ? dp.value === true : false;   // true = ON, false = OFF
}

async function acionarDispositivoIR() {
  const infrared_id = process.env.TUYA_INFRARED_ID;
  const remote_id = process.env.TUYA_REMOTE_ID;
  const category_id = process.env.TUYA_REMOTE_CATEGORY_ID || '2';

  if (!infrared_id || !remote_id) {
    throw new Error('Configure TUYA_INFRARED_ID e TUYA_REMOTE_ID no .env para acionar o IR.');
  }

  const result = await context.request({
    path: `/v2.0/infrareds/${infrared_id}/remotes/${remote_id}/command`,
    method: 'POST',
    body: {
      key: 'Power',
      category_id: category_id
    }
  });

  console.log('🔘 Comando enviado para a TV (Power):', result);
}

module.exports = {
  ligarDispositivo,
  desligarDispositivo,
  obterStatusEnergia,
  obterStatusTomada,
  acionarDispositivoIR,
};
