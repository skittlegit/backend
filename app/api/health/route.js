import { success } from '@/lib/response';

export async function GET() {
  return success({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
}
