import logger from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  logger.error({ err, path: req.path, method: req.method }, 'Request error');
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
  });
}
