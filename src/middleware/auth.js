const { verifyAccessToken } = require('../utils/jwt');
const { error } = require('../utils/response');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 401, 'UNAUTHORIZED', 'Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return error(res, 401, 'UNAUTHORIZED', 'Token expired or invalid');
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return error(res, 403, 'FORBIDDEN', 'Access denied');
    }
    next();
  };
};

module.exports = { authenticate, requireRole };
