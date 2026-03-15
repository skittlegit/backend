const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function parseFileUpload(request) {
  const formData = await request.formData();
  const photo = formData.get('photo');

  // Extract non-file fields into a body object
  const body = {};
  for (const [key, value] of formData.entries()) {
    if (key !== 'photo') {
      body[key] = value;
    }
  }

  if (!photo || typeof photo === 'string') {
    return { body, file: null, fileError: null };
  }

  if (!ALLOWED_MIME_TYPES.includes(photo.type)) {
    return { body, file: null, fileError: { statusCode: 400, code: 'BAD_REQUEST', message: 'Photo must be image/jpeg or image/png' } };
  }

  if (photo.size > MAX_FILE_SIZE) {
    return { body, file: null, fileError: { statusCode: 413, code: 'FILE_TOO_LARGE', message: 'Photo file exceeds the 10MB size limit' } };
  }

  const buffer = Buffer.from(await photo.arrayBuffer());

  return {
    body,
    file: {
      buffer,
      mimetype: photo.type,
      originalname: photo.name,
      size: photo.size,
    },
    fileError: null,
  };
}
