import { GraphQLScalarType, Kind, GraphQLFloat, GraphQLInt, valueFromASTUntyped } from 'graphql';

export const GraphQLMixed = new GraphQLScalarType({
    name: 'Mixed',
    description: 'Kiểu dữ liệu linh hoạt (JSON/Any)',
    serialize: (value) => value,
    parseValue: (value) => value,
    // `valueFromASTUntyped` là helper chuẩn của graphql-js cho đúng use-case "scalar
    // Any/JSON" — parse ĐỆ QUY mọi AST node (scalar/object/list, kể cả lồng nhau) thành
    // giá trị JS thuần, khác hẳn code cũ (chỉ nhận OBJECT/LIST, trả thẳng raw AST node
    // thay vì giá trị đã parse, và null hoá mọi scalar leaf như string/number/boolean).
    // Bug cũ chỉ lộ ra khi có caller thực sự gửi 1 giá trị Mixed dạng LITERAL (không qua
    // variable $()) — đúng cách FE bắt buộc dùng cho list-typed arg (xem comment "ids"/
    // "filters" trong contentEntry.service.ts phía FE) do hạn chế codegen của
    // typed-graphql-builder với biến kiểu list.
    parseLiteral: (ast) => valueFromASTUntyped(ast),
});

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function toVnDateString(date: Date): string {
    const shifted = new Date(date.getTime() + VN_OFFSET_MS);
    const yyyy = shifted.getUTCFullYear();
    const MM = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    const HH = String(shifted.getUTCHours()).padStart(2, '0');
    const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
    const ss = String(shifted.getUTCSeconds()).padStart(2, '0');
    const SSS = String(shifted.getUTCMilliseconds()).padStart(3, '0');
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}.${SSS} +0700`;
}

export const GraphQLDate = new GraphQLScalarType({
    name: 'DateTime',
    description: 'Date scalar — serialize as "yyyy-MM-dd HH:mm:ss.SSS +0700"',

    serialize(value: unknown): string | null {
        if (value === null || value === undefined) return null;

        if (value instanceof Date) {
            return toVnDateString(value);
        }
        if (typeof value === 'string') {
            const d = new Date(value);
            if (!isNaN(d.getTime())) return toVnDateString(d);
            return value;
        }
        if (typeof value === 'number') {
            return toVnDateString(new Date(value));
        }
        throw new Error(`GraphQLDate cannot serialize: ${value}`);
    },

    parseValue(value: unknown): Date | null {
        if (value === null || value === undefined) return null;

        if (typeof value === 'string' || typeof value === 'number') {
            return new Date(value);
        }
        throw new Error(`GraphQLDate cannot parse value: ${value}`);
    },

    parseLiteral(ast): Date | null {
        if (ast.kind === Kind.NULL) return null;

        if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
            return new Date(ast.value);
        }
        throw new Error(`GraphQLDate cannot parse literal`);
    },
});

export class Int {
    static readonly _gqlType = GraphQLInt;
    static readonly _typeName = 'Int';
}

export class Float {
    static readonly _gqlType = GraphQLFloat;
    static readonly _typeName = 'Float';
}

// Helper để check
export function isGqlScalarWrapper(type: any): boolean {
    return type === Int || type === Float;
}