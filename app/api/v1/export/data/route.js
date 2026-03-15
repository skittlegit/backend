import prisma from '@/lib/prisma';
import { authenticate, requireRole } from '@/lib/auth';
import { success, error } from '@/lib/response';

const BOARD_TYPE_LABELS = {
  gsb: 'Glow Sign Board',
  non_lit: 'Non-Lit Board',
  acp: 'ACP Board',
  backlit: 'Backlit Board',
  led: 'LED Board',
  flex: 'Flex Board',
  other: 'Other',
};

// GET /api/v1/export/data
export async function GET(request) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const roleError = requireRole(user, 'manager');
    if (roleError) return roleError;

    const { searchParams } = new URL(request.url);
    const storeIds = searchParams.get('storeIds');
    const status = searchParams.get('status');

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

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true },
    });

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      generatedBy: currentUser,
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

    return success(exportPayload);
  } catch (err) {
    console.error('Export error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
