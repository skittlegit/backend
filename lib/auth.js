import { verifyAccessToken } from '@/lib/jwt';
import { error } from '@/lib/response';

export function authenticate(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, errorResponse: error(401, 'UNAUTHORIZED', 'Missing or invalid authorization header') };
  }

  const token = authHeader.slice(7);
  try {
    const user = verifyAccessToken(token);
    return { user, errorResponse: null };
  } catch {
    return { user: null, errorResponse: error(401, 'UNAUTHORIZED', 'Token expired or invalid') };
  }
}

export function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) {
    return error(403, 'FORBIDDEN', 'Access denied');
  }
  return null;
}
