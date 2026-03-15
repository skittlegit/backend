import { NextResponse } from 'next/server';

export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function success(data, statusCode = 200) {
  return NextResponse.json({ success: true, data }, { status: statusCode });
}

export function error(statusCode, code, message, fields) {
  const body = { success: false, error: { code, message } };
  if (fields) body.error.fields = fields;
  return NextResponse.json(body, { status: statusCode });
}
