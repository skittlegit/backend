class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data });
};

const error = (res, statusCode, code, message, fields) => {
  const body = { success: false, error: { code, message } };
  if (fields) body.error.fields = fields;
  return res.status(statusCode).json(body);
};

module.exports = { AppError, success, error };
