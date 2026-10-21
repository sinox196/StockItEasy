import { HttpStatus } from '@nestjs/common';

/**
 * Business error with a stable code. Codes double as i18n keys on the clients
 * (`errors.<CODE>`), so messages are never hard-coded server side.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super(code);
  }

  static notFound(details?: unknown) {
    return new AppError('NOT_FOUND', HttpStatus.NOT_FOUND, details);
  }
  static forbidden(code = 'FORBIDDEN', details?: unknown) {
    return new AppError(code, HttpStatus.FORBIDDEN, details);
  }
  static unauthenticated(code = 'UNAUTHENTICATED') {
    return new AppError(code, HttpStatus.UNAUTHORIZED);
  }
  static conflict(code = 'CONFLICT', details?: unknown) {
    return new AppError(code, HttpStatus.CONFLICT, details);
  }
  static invalidState(details?: unknown) {
    return new AppError('INVALID_STATE', HttpStatus.CONFLICT, details);
  }
  static unprocessable(code: string, details?: unknown) {
    return new AppError(code, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}
