import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@/lib/jwt';
import { success, error } from '@/lib/response';

const SALT_ROUNDS = 12;

export async function POST(request) {
  try {
    const { name, email, password, role } = await request.json();

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
      return error(422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    // Check for existing email
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return error(409, 'CONFLICT', 'Email already registered');
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

    return success({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    }, 201);
  } catch (err) {
    console.error('Register error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
