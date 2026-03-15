const { AppError, error } = require('../utils/response');

const errorHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return error(res, err.statusCode, err.code, err.message);
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return error(res, 413, 'FILE_TOO_LARGE', 'Photo file exceeds the 10MB size limit');
  }

  if (err.type === 'entity.parse.failed') {
    return error(res, 400, 'BAD_REQUEST', 'Invalid JSON in request body');
  }

  console.error('Unhandled error:', err);
  return error(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
};

module.exports = errorHandler;
