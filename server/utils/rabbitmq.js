import amqplib from 'amqplib';
import logger from './logger.js';

function buildRabbitMQUrl() {
  if (process.env.RABBITMQ_URL) return process.env.RABBITMQ_URL;
  const host     = process.env.RABBITMQ_HOST     || 'localhost';
  const port     = process.env.RABBITMQ_PORT     || '5672';
  const username = process.env.RABBITMQ_USERNAME || 'guest';
  const password = process.env.RABBITMQ_PASSWORD || 'guest';
  return `amqp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}
const RABBITMQ_URL = buildRabbitMQUrl();
export const EXCHANGE = 'leadgen';

const RECONNECT_DELAY_MS = 5000;

let _conn         = null;
let _channel      = null;
let _reconnecting = false;
// Re-run after every successful (re)connect, including the first — lets
// index.js re-subscribe the pipeline/enrich consumers on the new channel.
// Without this, a dropped connection "heals" publishJob() but the
// consumers stay bound to the dead channel object forever, since they
// closed over it directly at boot.
let _onReconnect  = null;

export function onReconnect(callback) {
  _onReconnect = callback;
}

async function connectOnce() {
  _conn    = await amqplib.connect(RABBITMQ_URL);
  _channel = await _conn.createChannel();
  await _channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  logger.info('[RABBITMQ] Connected');

  _conn.on('error', (err) => {
    // 'close' always follows 'error' on the underlying connection, so the
    // actual state reset + reconnect scheduling happens there, not here.
    logger.error({ err }, '[RABBITMQ] Connection error');
  });
  _conn.on('close', () => {
    logger.warn('[RABBITMQ] Connection closed — scheduling reconnect');
    _conn = null;
    _channel = null;
    scheduleReconnect();
  });

  if (_onReconnect) await _onReconnect(_channel);

  return _channel;
}

function scheduleReconnect() {
  if (_reconnecting) return;
  _reconnecting = true;
  setTimeout(async () => {
    _reconnecting = false;
    try {
      await connectOnce();
    } catch (err) {
      logger.error({ err }, '[RABBITMQ] Reconnect attempt failed');
      scheduleReconnect();
    }
  }, RECONNECT_DELAY_MS);
}

export async function connectRabbitMQ() {
  return connectOnce();
}

export function getChannel() {
  if (!_channel) throw new Error('RabbitMQ not connected');
  return _channel;
}

export function isConnected() {
  return !!_channel;
}

export async function publishJob(routingKey, payload) {
  if (!_channel) {
    logger.warn({ routingKey }, '[RABBITMQ] Not connected — running job inline not possible, job lost');
    throw new Error('RabbitMQ not available');
  }
  _channel.publish(
    EXCHANGE,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true },
  );
  logger.debug({ routingKey }, '[RABBITMQ] Job published');
}
