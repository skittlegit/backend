import prisma from '@/lib/prisma';
import { authenticate } from '@/lib/auth';
import { success, error } from '@/lib/response';

export async function GET(request) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const found = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!found) {
      return error(404, 'NOT_FOUND', 'User not found');
    }

    return success(found);
  } catch (err) {
    console.error('Me error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
