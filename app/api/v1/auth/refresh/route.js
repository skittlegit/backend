import prisma from '@/lib/prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@/lib/jwt';
import { success, error } from '@/lib/response';

export async function POST(request) {
  try {
    const { refreshToken: token } = await request.json();

    if (!token) {
      return error(422, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'refreshToken', message: 'Refresh token is required' },
      ]);
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      return error(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
    }

    // Find and delete the used token (single use)
    const storedToken = await prisma.refreshToken.findUnique({ where: { token } });
    if (!storedToken) {
      return error(401, 'UNAUTHORIZED', 'Refresh token not found or already used');
    }

    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return error(401, 'UNAUTHORIZED', 'User no longer exists');
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

    return success({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('Refresh error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
