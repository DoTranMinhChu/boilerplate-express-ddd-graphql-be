import { EErrorCode } from '@/core/shared/enums/errorCode.enum';

// Accepts a raw string too (not just EErrorCode) so existing string-literal call sites
// keep compiling while they're migrated over — new code should always use EErrorCode.
export type TErrorCode = EErrorCode | string;

export class AppException extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code: TErrorCode = EErrorCode.INTERNAL_ERROR,
    public readonly data?: Record<string, any>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestException extends AppException {
  constructor(message: string = 'Bad Request', code: TErrorCode = EErrorCode.VALIDATION_FAILED, data?: Record<string, any>) {
    super(message, 400, code, data);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message: string = 'Unauthorized', code: TErrorCode = EErrorCode.AUTH_REQUIRED, data?: Record<string, any>) {
    super(message, 401, code, data);
  }
}

export class ForbiddenException extends AppException {
  constructor(message: string = 'Forbidden', code: TErrorCode = EErrorCode.PERMISSION_DENIED, data?: Record<string, any>) {
    super(message, 403, code, data);
  }
}

export class NotFoundException extends AppException {
  constructor(message: string = 'Not Found', code: TErrorCode = EErrorCode.RESOURCE_NOT_FOUND, data?: Record<string, any>) {
    super(message, 404, code, data);
  }
}

export class ConflictException extends AppException {
  constructor(message: string = 'Conflict', code: TErrorCode = EErrorCode.RESOURCE_DUPLICATE, data?: Record<string, any>) {
    super(message, 409, code, data);
  }
}

export class ValidationException extends AppException {
  constructor(
    message: string = 'Validation Failed',
    public readonly errors: any[] = [],
    code: TErrorCode = EErrorCode.VALIDATION_FAILED,
  ) {
    super(message, 422, code);
  }
}

export class InternalServerException extends AppException {
  constructor(message: string = 'Internal Server Error', code: TErrorCode = EErrorCode.INTERNAL_ERROR) {
    super(message, 500, code);
  }
}
