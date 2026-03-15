const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');
const supabase = require('../config/supabase');
const config = require('../config');
const { success, error } = require('../utils/response');

const VALID_BOARD_TYPES = ['gsb', 'non_lit', 'acp', 'backlit', 'led', 'flex', 'other'];
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]$/;

const uploadPhotoToSupabase = async (file, userId) => {
  const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
  const filePath = `photos/${userId}/${uuidv4()}.${ext}`;

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
};

const createBoard = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'photo', message: 'Photo is required' },
      ]);
    }

    const {
      store_id, store_name, phone, gst_in, board_type, board_type_label,
      width_inches, height_inches, latitude, longitude,
      rect_x, rect_y, rect_w, rect_h, notes,
    } = req.body;

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
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    // Verify store exists
    const store = await prisma.store.findUnique({ where: { id: store_id } });
    if (!store) {
      return error(res, 404, 'NOT_FOUND', 'store_id does not exist');
    }

    // Upload photo
    const { photoUrl, photoPath } = await uploadPhotoToSupabase(file, req.user.id);

    // Create board and update store in a transaction
    const board = await prisma.$transaction(async (tx) => {
      const newBoard = await tx.board.create({
        data: {
          storeId: store_id,
          agentId: req.user.id,
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

    return success(res, board, 201);
  } catch (err) {
    next(err);
  }
};

const listBoards = async (req, res, next) => {
  try {
    const { storeId, agentId, page = '1', limit = '100' } = req.query;

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

    return success(res, {
      boards,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getBoard = async (req, res, next) => {
  try {
    const { id } = req.params;

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true, email: true } },
      },
    });

    if (!board) {
      return error(res, 404, 'NOT_FOUND', 'Board not found');
    }

    return success(res, board);
  } catch (err) {
    next(err);
  }
};

const updateBoard = async (req, res, next) => {
  try {
    const { id } = req.params;

    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) {
      return error(res, 404, 'NOT_FOUND', 'Board not found');
    }

    // Only the submitting agent or a manager can update
    if (board.agentId !== req.user.id && req.user.role !== 'manager') {
      return error(res, 403, 'FORBIDDEN', 'User is not the submitting agent or a manager');
    }

    const {
      store_name, phone, gst_in, board_type, board_type_label,
      width_inches, height_inches, rect_x, rect_y, rect_w, rect_h, notes,
    } = req.body;

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
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    const updated = await prisma.board.update({
      where: { id },
      data,
      include: {
        agent: { select: { id: true, name: true, email: true } },
      },
    });

    return success(res, updated);
  } catch (err) {
    next(err);
  }
};

const deleteBoard = async (req, res, next) => {
  try {
    const { id } = req.params;

    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) {
      return error(res, 404, 'NOT_FOUND', 'Board not found');
    }

    // Only the submitting agent or a manager can delete
    if (board.agentId !== req.user.id && req.user.role !== 'manager') {
      return error(res, 403, 'FORBIDDEN', 'User is not the submitting agent or a manager');
    }

    // Delete photo from Supabase storage
    if (board.photoPath) {
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

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { createBoard, listBoards, getBoard, updateBoard, deleteBoard };
