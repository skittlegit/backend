import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, requireRole } from '@/lib/auth';
import { success, error } from '@/lib/response';

// GET /api/v1/stores/[id]
export async function GET(request, { params }) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { id } = await params;

    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        boards: {
          orderBy: { submittedAt: 'desc' },
          include: {
            agent: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!store) {
      return error(404, 'NOT_FOUND', 'Store with given ID does not exist');
    }

    return success(store);
  } catch (err) {
    console.error('Get store error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// PUT /api/v1/stores/[id]
export async function PUT(request, { params }) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const roleError = requireRole(user, 'manager');
    if (roleError) return roleError;

    const { id } = await params;

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return error(404, 'NOT_FOUND', 'Store not found');
    }

    const { name, area } = await request.json();

    const fields = [];
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 200)) {
      fields.push({ field: 'name', message: 'Name must be 1-200 characters' });
    }
    if (area !== undefined && area !== null && (typeof area !== 'string' || area.trim().length > 200)) {
      fields.push({ field: 'area', message: 'Area must be 1-200 characters' });
    }
    if (fields.length > 0) {
      return error(422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (area !== undefined) data.area = area ? area.trim() : null;

    const store = await prisma.store.update({
      where: { id },
      data,
      include: {
        boards: {
          orderBy: { submittedAt: 'desc' },
          include: {
            agent: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return success(store);
  } catch (err) {
    console.error('Update store error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// DELETE /api/v1/stores/[id]
export async function DELETE(request, { params }) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const roleError = requireRole(user, 'manager');
    if (roleError) return roleError;

    const { id } = await params;

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return error(404, 'NOT_FOUND', 'Store not found');
    }

    // Cascade delete handles boards
    await prisma.store.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('Delete store error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
