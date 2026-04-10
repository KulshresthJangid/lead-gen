import { config as dotenvConfig } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dotenvDir = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dotenvDir, '.env') });
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { initDb } from './db.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import leadsRouter from './routes/leads.js';
import statsRouter from './routes/stats.js';
import pipelineRouter from './routes/pipeline.js';
import settingsRouter from './routes/settings.js';
import authRouter from './routes/auth.js';
import aiLogsRouter from './routes/ai-logs.js';
import campaignsRouter from './routes/campaigns.js';
import usersRouter from './routes/users.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { initScheduler } from './workers/scheduler.js';
import { connectRabbitMQ } from './utils/rabbitmq.js';
import { startPipelineConsumer } from './workers/pipelineWorker.js';
import { startEnrichConsumer } from './workers/enrichWorker.js';
import logger from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimiter);

// ── API Routes ────────────────────────────────────────────────────────────────
// Auth endpoints — public (no token required)
app.use('/api/auth', authRouter);

// All other API routes require a valid JWT
app.use('/api/leads',     requireAuth, leadsRouter);
app.use('/api/stats',     requireAuth, statsRouter);
app.use('/api/pipeline',  requireAuth, pipelineRouter);
app.use('/api/settings',  requireAuth, settingsRouter);
app.use('/api/ai-logs',   requireAuth, aiLogsRouter);
app.use('/api/campaigns', requireAuth, campaignsRouter);
app.use('/api/users',     requireAuth, usersRouter);

// ── Static (production) ───────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(join(clientDist, 'index.html')));
}

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');
  socket.on('disconnect', () =>
    logger.info({ socketId: socket.id }, 'Client disconnected'),
  );
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDb();

    // RabbitMQ — optional; server runs without it but pipelines won't queue
    let rmqChannel = null;
    try {
      const db = (await import('./db.js')).getDb();
      rmqChannel = await connectRabbitMQ();
      await startPipelineConsumer(rmqChannel, db);
      await startEnrichConsumer(rmqChannel);
    } catch (err) {
      logger.warn({ err: err.message }, '[BOOT] RabbitMQ unavailable — pipeline workers inactive');
    }

    await initScheduler(io);
    httpServer.listen(PORT, () =>
      logger.info(`Server listening on http://localhost:${PORT}`),
    );
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down`);
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
