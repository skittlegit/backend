import prisma from '@/lib/prisma';
import { authenticate } from '@/lib/auth';
import { success, error } from '@/lib/response';

// PUT /api/v1/stores/[id]/complete
export async function PUT(request, { params }) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { id } = await params;

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return error(404, 'NOT_FOUND', 'Store not found');
    }

    const store = await prisma.store.update({
      where: { id },
      data: { status: 'completed' },
    });

    return success(store);
  } catch (err) {
    console.error('Mark complete error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
