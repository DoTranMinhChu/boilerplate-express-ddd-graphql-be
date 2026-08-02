// src/core/shared/utils/dbErrorClassifier.ts
//
// Single source of truth for "TypeORM/Postgres error → client-facing message" mapping.
// Previously hand-rolled twice (REST error.middleware.ts and the GraphQL formatError in
// server.ts) with slightly different coverage — a code added to one path could silently
// be missing from the other. Both now import this.
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';

const TYPEORM_UNIQUE_VIOLATION = '23505';  // duplicate key
const TYPEORM_FK_VIOLATION = '23503';      // foreign key violation
const TYPEORM_NOT_NULL = '23502';          // not null violation
const TYPEORM_CHECK_VIOLATION = '23514';   // check constraint
const TYPEORM_UNDEFINED_COLUMN = '42703';  // column does not exist
const TYPEORM_UNDEFINED_TABLE = '42P01';   // table does not exist
const TYPEORM_SYNTAX_ERROR = '42601';      // SQL syntax error
const TYPEORM_INVALID_INPUT = '22P02';     // invalid input syntax (wrong type)

export function isDbError(error: any): boolean {
    const name = error?.name ?? '';
    return (
        name === 'QueryFailedError' ||
        name === 'EntityNotFoundError' ||
        name === 'CannotCreateEntityIdMapError' ||
        (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code))
    );
}

export interface IClassifiedDbError {
    status: number;
    message: string;
    code: EErrorCode;
}

export function classifyDbError(error: any): IClassifiedDbError {
    const code = error?.code as string | undefined;
    const detail = error?.detail as string | undefined;
    const message = error?.message as string | undefined;

    if (code === TYPEORM_UNDEFINED_COLUMN || code === TYPEORM_UNDEFINED_TABLE) {
        return { status: 400, message: 'Trường dữ liệu không hợp lệ trong câu truy vấn.', code: EErrorCode.DATABASE_ERROR };
    }

    if (code === TYPEORM_UNIQUE_VIOLATION) {
        const field = detail?.match(/\(([^)]+)\)/)?.[1] ?? 'trường';
        return { status: 409, message: `Giá trị của "${field}" đã tồn tại.`, code: EErrorCode.DUPLICATE_ENTRY };
    }

    if (code === TYPEORM_FK_VIOLATION) {
        return { status: 400, message: 'Dữ liệu liên kết không hợp lệ hoặc không tồn tại.', code: EErrorCode.FK_VIOLATION };
    }

    if (code === TYPEORM_NOT_NULL) {
        const field = detail?.match(/column "([^"]+)"/)?.[1] ?? 'trường';
        return { status: 400, message: `Trường "${field}" không được để trống.`, code: EErrorCode.NOT_NULL_VIOLATION };
    }

    if (code === TYPEORM_CHECK_VIOLATION) {
        return { status: 400, message: 'Dữ liệu không thỏa mãn điều kiện ràng buộc.', code: EErrorCode.CHECK_VIOLATION };
    }

    if (code === TYPEORM_INVALID_INPUT) {
        return { status: 400, message: 'Định dạng dữ liệu đầu vào không hợp lệ.', code: EErrorCode.INVALID_INPUT };
    }

    if (code === TYPEORM_SYNTAX_ERROR) {
        return { status: 400, message: 'Câu truy vấn không hợp lệ.', code: EErrorCode.SYNTAX_ERROR };
    }

    if (message?.includes('column') && message?.includes('does not exist')) {
        return { status: 400, message: 'Trường dữ liệu không hợp lệ trong câu truy vấn.', code: EErrorCode.DATABASE_ERROR };
    }
    if (message?.includes('relation') && message?.includes('does not exist')) {
        return { status: 400, message: 'Bảng dữ liệu không tồn tại.', code: EErrorCode.DATABASE_ERROR };
    }

    return { status: 500, message: 'Lỗi truy vấn cơ sở dữ liệu.', code: EErrorCode.DATABASE_ERROR };
}
