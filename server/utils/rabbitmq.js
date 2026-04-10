import amqplib from 'amqplib';
import logger from './logger.js';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
export const EXCHANGE = 'leadgen';

let _conn    = null;
let _channel = null;

export async function connectRabbitMQ() {
  _conn    = await amqplib.connect(RABBITMQ_URL);
  _channel = await _conn.createChannel();
  await _channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  logger.info('[RABBITMQ] Connected');

  _conn.on('error', (err) => {
    logger.error({ err }, '[RABBITMQ] Connection error');
    _conn = null; _channel = null;
  });
  _conn.on('close', () => {
    logger.warn('[RABBITMQ] Connection closed');
    _conn = null; _channel = null;
  });

  return _channel;
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
