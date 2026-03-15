import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate } from '@/lib/auth';
import { error } from '@/lib/response';

export async function POST(request) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { refreshToken: token } = await request.json();

    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('Logout error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
