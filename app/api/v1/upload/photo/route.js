import { randomUUID } from 'crypto';
import getSupabase from '@/lib/supabase';
import getConfig from '@/lib/config';
import { authenticate } from '@/lib/auth';
import { success, error } from '@/lib/response';
import { parseFileUpload } from '@/lib/upload';

// POST /api/v1/upload/photo
export async function POST(request) {
  try {
    const { user, errorResponse } = authenticate(request);
    if (errorResponse) return errorResponse;

    const { file, fileError } = await parseFileUpload(request);

    if (fileError) {
      return error(fileError.statusCode, fileError.code, fileError.message);
    }

    if (!file) {
      return error(422, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'photo', message: 'Photo is required' },
      ]);
    }

    const config = getConfig();
    const supabase = getSupabase();
    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filePath = `photos/temp/${user.id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(config.supabase.bucket)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return error(500, 'INTERNAL_ERROR', `Photo upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage
      .from(config.supabase.bucket)
      .getPublicUrl(filePath);

    return success({
      photoUrl: data.publicUrl,
      photoPath: filePath,
    });
  } catch (err) {
    console.error('Upload photo error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
