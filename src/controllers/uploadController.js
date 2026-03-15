const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const config = require('../config');
const { success, error } = require('../utils/response');

const uploadPhoto = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return error(res, 422, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'photo', message: 'Photo is required' },
      ]);
    }

    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filePath = `photos/temp/${req.user.id}/${uuidv4()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(config.supabase.bucket)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return error(res, 500, 'INTERNAL_ERROR', `Photo upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage
      .from(config.supabase.bucket)
      .getPublicUrl(filePath);

    return success(res, {
      photoUrl: data.publicUrl,
      photoPath: filePath,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadPhoto };
