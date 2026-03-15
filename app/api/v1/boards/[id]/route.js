import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import getSupabase from '@/lib/supabase';
import getConfig from '@/lib/config';
import { authenticate } from '@/lib/auth';
import { success, error } from '@/lib/response';

const VALID_BOARD_TYPES = ['gsb', 'non_lit', 'acp', 'backlit', 'led', 'flex', 'other'];
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]$/;

// GET /api/v1/boards/[id]
export async function GET(request, { params }) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { id } = await params;

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true, email: true } },
      },
    });

    if (!board) {
      return error(404, 'NOT_FOUND', 'Board not found');
    }

    return success(board);
  } catch (err) {
    console.error('Get board error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// PUT /api/v1/boards/[id]
export async function PUT(request, { params }) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { id } = await params;

    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) {
      return error(404, 'NOT_FOUND', 'Board not found');
    }

    // Only the submitting agent or a manager can update
    if (board.agentId !== user.id && user.role !== 'manager') {
      return error(403, 'FORBIDDEN', 'User is not the submitting agent or a manager');
    }

    const {
      store_name, phone, gst_in, board_type, board_type_label,
      width_inches, height_inches, rect_x, rect_y, rect_w, rect_h, notes,
    } = await request.json();

    const fields = [];
    const data = {};

    if (store_name !== undefined) {
      if (typeof store_name !== 'string' || store_name.length > 200) {
        fields.push({ field: 'store_name', message: 'Must be 1-200 chars' });
      } else {
        data.storeName = store_name;
      }
    }
    if (phone !== undefined) {
      if (!/^\d{10}$/.test(phone)) {
        fields.push({ field: 'phone', message: '10-digit number required' });
      } else {
        data.phone = phone;
      }
    }
    if (gst_in !== undefined) {
      if (gst_in && !GSTIN_REGEX.test(gst_in)) {
        fields.push({ field: 'gst_in', message: 'Invalid GSTIN format' });
      } else {
        data.gstIn = gst_in || null;
      }
    }
    if (board_type !== undefined) {
      if (!VALID_BOARD_TYPES.includes(board_type)) {
        fields.push({ field: 'board_type', message: `Must be one of: ${VALID_BOARD_TYPES.join(', ')}` });
      } else {
        data.boardType = board_type;
      }
    }
    if (board_type_label !== undefined) data.boardTypeLabel = board_type_label || null;
    if (width_inches !== undefined) {
      const w = parseFloat(width_inches);
      if (isNaN(w) || w <= 0) fields.push({ field: 'width_inches', message: 'Positive number required' });
      else data.widthInches = w;
    }
    if (height_inches !== undefined) {
      const h = parseFloat(height_inches);
      if (isNaN(h) || h <= 0) fields.push({ field: 'height_inches', message: 'Positive number required' });
      else data.heightInches = h;
    }

    // rect fields must be provided together
    if (rect_x !== undefined || rect_y !== undefined || rect_w !== undefined || rect_h !== undefined) {
      const rx = parseFloat(rect_x);
      const ry = parseFloat(rect_y);
      const rw = parseFloat(rect_w);
      const rh = parseFloat(rect_h);
      if ([rx, ry, rw, rh].some(v => isNaN(v) || v < 0 || v > 1)) {
        fields.push({ field: 'rect', message: 'Must provide rect_x, rect_y, rect_w, rect_h all between 0.0-1.0' });
      } else {
        data.rectX = rx;
        data.rectY = ry;
        data.rectW = rw;
        data.rectH = rh;
      }
    }

    if (notes !== undefined) data.notes = notes || null;

    if (fields.length > 0) {
      return error(422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    const updated = await prisma.board.update({
      where: { id },
      data,
      include: {
        agent: { select: { id: true, name: true, email: true } },
      },
    });

    return success(updated);
  } catch (err) {
    console.error('Update board error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// DELETE /api/v1/boards/[id]
export async function DELETE(request, { params }) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { id } = await params;

    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) {
      return error(404, 'NOT_FOUND', 'Board not found');
    }

    // Only the submitting agent or a manager can delete
    if (board.agentId !== user.id && user.role !== 'manager') {
      return error(403, 'FORBIDDEN', 'User is not the submitting agent or a manager');
    }

    // Delete photo from Supabase storage
    if (board.photoPath) {
      const config = getConfig();
      const supabase = getSupabase();
      await supabase.storage.from(config.supabase.bucket).remove([board.photoPath]);
    }

    await prisma.$transaction(async (tx) => {
      await tx.board.delete({ where: { id } });

      const store = await tx.store.findUnique({ where: { id: board.storeId } });
      if (store) {
        const newCount = Math.max(0, store.boardCount - 1);
        const newStatus = newCount === 0 && store.status === 'in_progress' ? 'pending' : store.status;
        await tx.store.update({
          where: { id: board.storeId },
          data: { boardCount: newCount, status: newStatus },
        });
      }
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('Delete board error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
