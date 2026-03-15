import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import getSupabase from '@/lib/supabase';
import getConfig from '@/lib/config';
import { authenticate } from '@/lib/auth';
import { success, error } from '@/lib/response';
import { parseFileUpload } from '@/lib/upload';

const VALID_BOARD_TYPES = ['gsb', 'non_lit', 'acp', 'backlit', 'led', 'flex', 'other'];
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]$/;

async function uploadPhotoToSupabase(file, userId) {
  const config = getConfig();
  const supabase = getSupabase();
  const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
  const filePath = `photos/${userId}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(config.supabase.bucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Photo upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from(config.supabase.bucket)
    .getPublicUrl(filePath);

  return { photoUrl: data.publicUrl, photoPath: filePath };
}

// GET /api/v1/boards
export async function GET(request) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const agentId = searchParams.get('agentId');
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '100';

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (storeId) where.storeId = storeId;
    if (agentId) where.agentId = agentId;

    const [boards, total] = await Promise.all([
      prisma.board.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.board.count({ where }),
    ]);

    return success({
      boards,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('List boards error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// POST /api/v1/boards
export async function POST(request) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { body, file, fileError } = await parseFileUpload(request);

    if (fileError) {
      return error(fileError.statusCode, fileError.code, fileError.message);
    }

    if (!file) {
      return error(422, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'photo', message: 'Photo is required' },
      ]);
    }

    const {
      store_id, store_name, phone, gst_in, board_type, board_type_label,
      width_inches, height_inches, latitude, longitude,
      rect_x, rect_y, rect_w, rect_h, notes,
    } = body;

    // Validation
    const fields = [];
    if (!store_id) fields.push({ field: 'store_id', message: 'Store ID is required' });
    if (!store_name || store_name.length > 200) fields.push({ field: 'store_name', message: 'Store name is required (1-200 chars)' });
    if (!phone || !/^\d{10}$/.test(phone)) fields.push({ field: 'phone', message: '10-digit mobile number required' });
    if (gst_in && !GSTIN_REGEX.test(gst_in)) fields.push({ field: 'gst_in', message: 'Invalid GSTIN format' });
    if (!board_type || !VALID_BOARD_TYPES.includes(board_type)) fields.push({ field: 'board_type', message: `Must be one of: ${VALID_BOARD_TYPES.join(', ')}` });
    if (board_type === 'other' && !board_type_label) fields.push({ field: 'board_type_label', message: 'Custom label required when board_type is other' });

    const w = parseFloat(width_inches);
    const h = parseFloat(height_inches);
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rx = parseFloat(rect_x);
    const ry = parseFloat(rect_y);
    const rw = parseFloat(rect_w);
    const rh = parseFloat(rect_h);

    if (isNaN(w) || w <= 0) fields.push({ field: 'width_inches', message: 'Positive number required' });
    if (isNaN(h) || h <= 0) fields.push({ field: 'height_inches', message: 'Positive number required' });
    if (isNaN(lat) || lat < -90 || lat > 90) fields.push({ field: 'latitude', message: 'Must be -90 to 90' });
    if (isNaN(lng) || lng < -180 || lng > 180) fields.push({ field: 'longitude', message: 'Must be -180 to 180' });
    if (isNaN(rx) || rx < 0 || rx > 1) fields.push({ field: 'rect_x', message: 'Must be 0.0-1.0' });
    if (isNaN(ry) || ry < 0 || ry > 1) fields.push({ field: 'rect_y', message: 'Must be 0.0-1.0' });
    if (isNaN(rw) || rw < 0 || rw > 1) fields.push({ field: 'rect_w', message: 'Must be 0.0-1.0' });
    if (isNaN(rh) || rh < 0 || rh > 1) fields.push({ field: 'rect_h', message: 'Must be 0.0-1.0' });

    if (fields.length > 0) {
      return error(422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    // Verify store exists
    const store = await prisma.store.findUnique({ where: { id: store_id } });
    if (!store) {
      return error(404, 'NOT_FOUND', 'store_id does not exist');
    }

    // Upload photo
    const { photoUrl, photoPath } = await uploadPhotoToSupabase(file, user.id);

    // Create board and update store in a transaction
    const board = await prisma.$transaction(async (tx) => {
      const newBoard = await tx.board.create({
        data: {
          storeId: store_id,
          agentId: user.id,
          storeName: store_name,
          phone,
          gstIn: gst_in || null,
          boardType: board_type,
          boardTypeLabel: board_type_label || null,
          widthInches: w,
          heightInches: h,
          latitude: lat,
          longitude: lng,
          photoUrl,
          photoPath,
          rectX: rx,
          rectY: ry,
          rectW: rw,
          rectH: rh,
          notes: notes || null,
        },
      });

      // Update store board count and status
      await tx.store.update({
        where: { id: store_id },
        data: {
          boardCount: { increment: 1 },
          status: store.status === 'pending' ? 'in_progress' : store.status,
        },
      });

      return newBoard;
    });

    return success(board, 201);
  } catch (err) {
    console.error('Create board error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
