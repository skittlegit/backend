import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@/lib/jwt';
import { success, error } from '@/lib/response';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return error(422, 'VALIDATION_ERROR', 'Validation failed', [
        ...(!email ? [{ field: 'email', message: 'Email is required' }] : []),
        ...(!password ? [{ field: 'password', message: 'Password is required' }] : []),
      ]);
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return error(401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return error(401, 'UNAUTHORIZED', 'Invalid email or password');
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

    return success({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
