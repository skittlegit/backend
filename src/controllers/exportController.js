const prisma = require('../config/prisma');
const { success, error } = require('../utils/response');

const BOARD_TYPE_LABELS = {
  gsb: 'Glow Sign Board',
  non_lit: 'Non-Lit Board',
  acp: 'ACP Board',
  backlit: 'Backlit Board',
  led: 'LED Board',
  flex: 'Flex Board',
  other: 'Other',
};

const exportData = async (req, res, next) => {
  try {
    const { storeIds, status } = req.query;

    const where = {};
    if (storeIds && typeof storeIds === 'string') {
      where.id = { in: storeIds.split(',').map(s => s.trim()).filter(Boolean) };
    }
    if (status && ['pending', 'in_progress', 'completed'].includes(status)) {
      where.status = status;
    }

    const stores = await prisma.store.findMany({
      where,
      include: {
        boards: {
          orderBy: { submittedAt: 'desc' },
          include: {
            agent: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const totalBoards = stores.reduce((sum, s) => sum + s.boards.length, 0);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true },
    });

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      generatedBy: user,
      summary: {
        totalStores: stores.length,
        totalBoards,
      },
      stores: stores.map(store => ({
        id: store.id,
        name: store.name,
        area: store.area,
        status: store.status,
        boards: store.boards.map(board => ({
          id: board.id,
          storeName: board.storeName,
          phone: board.phone,
          gstIn: board.gstIn,
          boardType: board.boardType,
          boardTypeLabel: board.boardTypeLabel || BOARD_TYPE_LABELS[board.boardType] || board.boardType,
          widthInches: board.widthInches,
          heightInches: board.heightInches,
          areaSqIn: Math.round(board.widthInches * board.heightInches * 100) / 100,
          latitude: board.latitude,
          longitude: board.longitude,
          photoUrl: board.photoUrl,
          rectX: board.rectX,
          rectY: board.rectY,
          rectW: board.rectW,
          rectH: board.rectH,
          notes: board.notes,
          submittedAt: board.submittedAt,
          agent: board.agent,
        })),
      })),
    };

    return success(res, exportPayload);
  } catch (err) {
    next(err);
  }
};

module.exports = { exportData };
