const prisma = require('../config/prisma');
const { success, error } = require('../utils/response');

const VALID_STATUSES = ['pending', 'in_progress', 'completed'];

const listStores = async (req, res, next) => {
  try {
    const { status, search, page = '1', limit = '50' } = req.query;

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

    return success(res, {
      stores,
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

const createStore = async (req, res, next) => {
  try {
    const { name, area } = req.body;

    const fields = [];
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 200) {
      fields.push({ field: 'name', message: 'Name is required (1-200 characters)' });
    }
    if (area !== undefined && area !== null && (typeof area !== 'string' || area.trim().length > 200)) {
      fields.push({ field: 'area', message: 'Area must be 1-200 characters' });
    }
    if (fields.length > 0) {
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', fields);
    }

    const store = await prisma.store.create({
      data: {
        name: name.trim(),
        area: area ? area.trim() : null,
      },
    });

    return success(res, store, 201);
  } catch (err) {
    next(err);
  }
};

const getStore = async (req, res, next) => {
  try {
    const { id } = req.params;

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
      return error(res, 404, 'NOT_FOUND', 'Store with given ID does not exist');
    }

    return success(res, store);
  } catch (err) {
    next(err);
  }
};

const updateStore = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, area } = req.body;

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return error(res, 404, 'NOT_FOUND', 'Store not found');
    }

    const fields = [];
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 200)) {
      fields.push({ field: 'name', message: 'Name must be 1-200 characters' });
    }
    if (area !== undefined && area !== null && (typeof area !== 'string' || area.trim().length > 200)) {
      fields.push({ field: 'area', message: 'Area must be 1-200 characters' });
    }
    if (fields.length > 0) {
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', fields);
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

    return success(res, store);
  } catch (err) {
    next(err);
  }
};

const markComplete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return error(res, 404, 'NOT_FOUND', 'Store not found');
    }

    const store = await prisma.store.update({
      where: { id },
      data: { status: 'completed' },
    });

    return success(res, store);
  } catch (err) {
    next(err);
  }
};

const deleteStore = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return error(res, 404, 'NOT_FOUND', 'Store not found');
    }

    // Cascade delete handles boards
    await prisma.store.delete({ where: { id } });

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { listStores, createStore, getStore, updateStore, markComplete, deleteStore };
