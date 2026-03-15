import jwt from 'jsonwebtoken';
import getConfig from '@/lib/config';

export function generateAccessToken(user) {
  const config = getConfig();
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

export function generateRefreshToken(user) {
  const config = getConfig();
  return jwt.sign(
    { id: user.id },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
}

export function verifyAccessToken(token) {
  const config = getConfig();
  return jwt.verify(token, config.jwt.accessSecret);
}

export function verifyRefreshToken(token) {
  const config = getConfig();
  return jwt.verify(token, config.jwt.refreshSecret);
}
