const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { success, error, AppError } = require('../utils/response');
const config = require('../config');

const SALT_ROUNDS = 12;

const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    // Validation
    const fields = [];
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
      fields.push({ field: 'name', message: 'Name is required (1-100 characters)' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fields.push({ field: 'email', message: 'Invalid email format' });
    }
    if (!password || typeof password !== 'string' || password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      fields.push({ field: 'password', message: 'Password must be at least 8 characters with a letter and a number' });
    }
    if (role && !['agent', 'manager'].includes(role)) {
      fields.push({ field: 'role', message: 'Role must be agent or manager' });
    }
    if (fields.length > 0) {
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    // Check for existing email
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return error(res, 409, 'CONFLICT', 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        passwordHash,
        role: role || 'agent',
      },
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token
    const decoded = verifyRefreshToken(refreshToken);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return success(res, {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    }, 201);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', [
        ...(!email ? [{ field: 'email', message: 'Email is required' }] : []),
        ...(!password ? [{ field: 'password', message: 'Password is required' }] : []),
      ]);
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return error(res, 401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return error(res, 401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const decoded = verifyRefreshToken(refreshToken);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return success(res, {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'refreshToken', message: 'Refresh token is required' },
      ]);
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      return error(res, 401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
    }

    // Find and delete the used token (single use)
    const storedToken = await prisma.refreshToken.findUnique({ where: { token } });
    if (!storedToken) {
      return error(res, 401, 'UNAUTHORIZED', 'Refresh token not found or already used');
    }

    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return error(res, 401, 'UNAUTHORIZED', 'User no longer exists');
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    const newDecoded = verifyRefreshToken(newRefreshToken);
    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt: new Date(newDecoded.exp * 1000),
      },
    });

    return success(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } });
    }

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) {
      return error(res, 404, 'NOT_FOUND', 'User not found');
    }

    return success(res, user);
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, logout, me };
