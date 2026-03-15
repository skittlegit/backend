import prisma from '@/lib/prisma';
import { authenticate, requireRole } from '@/lib/auth';
import { success, error } from '@/lib/response';

const VALID_STATUSES = ['pending', 'in_progress', 'completed'];

// GET /api/v1/stores
export async function GET(request) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }
    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { area: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.store.count({ where }),
    ]);

    return success({
      stores,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('List stores error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// POST /api/v1/stores
export async function POST(request) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const roleError = requireRole(user, 'manager');
    if (roleError) return roleError;

    const { name, area } = await request.json();

    const fields = [];
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 200) {
      fields.push({ field: 'name', message: 'Name is required (1-200 characters)' });
    }
    if (area !== undefined && area !== null && (typeof area !== 'string' || area.trim().length > 200)) {
      fields.push({ field: 'area', message: 'Area must be 1-200 characters' });
    }
    if (fields.length > 0) {
      return error(422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    const store = await prisma.store.create({
      data: {
        name: name.trim(),
        area: area ? area.trim() : null,
      },
    });

    return success(store, 201);
  } catch (err) {
    console.error('Create store error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
