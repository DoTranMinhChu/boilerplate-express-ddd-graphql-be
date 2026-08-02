// Dọn sạch MỌI cột `simple-array` trên toàn hệ thống — giải pháp tổng quát thay vì
// thêm transformer cho từng cột.
//
// Bối cảnh lỗi: `@Column({ type: 'simple-array', default: [] })` khiến Postgres đặt
// DEFAULT là chuỗi literal "[]". Khi đọc, TypeORM tách "[]" thành mảng ['[]'] (phần
// tử rác). Nếu cột là array enum (vd ETenantBusinessRole) → GraphQL báo lỗi
// 'Enum cannot represent value: "[]"'. TypeORM cũng có thể trả [''] cho simple-array rỗng.
//
// Subscriber này:
//   - afterLoad           : loại bỏ phần tử rác ('', '[]', null) khỏi mọi cột simple-array.
//   - beforeInsert        : chuẩn hoá undefined/null → [] (tránh dính DEFAULT '[]') + lọc rác.
//   - beforeUpdate        : lọc rác nếu giá trị được set (không đụng undefined để không ghi đè).

import {
    EntitySubscriberInterface,
    EventSubscriber,
    LoadEvent,
    InsertEvent,
    UpdateEvent,
} from 'typeorm';

// Chỉ cần 2 thuộc tính từ ColumnMetadata — tránh import sâu vào typeorm internals.
type SimpleColumn = { type: unknown; propertyName: string };

// Giá trị coi là rác trong 1 cột simple-array rỗng.
const JUNK_VALUES = new Set(['', '[]']);

function isJunk(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    return typeof v === 'string' && JUNK_VALUES.has(v.trim());
}

function simpleArrayColumns(columns?: ReadonlyArray<SimpleColumn>): SimpleColumn[] {
    return (columns ?? []).filter((c) => c.type === 'simple-array');
}

@EventSubscriber()
export class SimpleArraySanitizerSubscriber implements EntitySubscriberInterface {
    // Không override listenTo() → áp dụng cho TẤT CẢ entity.

    afterLoad(entity: any, event?: LoadEvent<any>): void {
        if (!entity) return;
        for (const col of simpleArrayColumns(event?.metadata?.columns)) {
            const val = entity[col.propertyName];
            if (!Array.isArray(val) || val.length === 0) continue;
            const cleaned = val.filter((v) => !isJunk(v));
            if (cleaned.length !== val.length) entity[col.propertyName] = cleaned;
        }
    }

    beforeInsert(event: InsertEvent<any>): void {
        const entity = event.entity;
        if (!entity) return;
        for (const col of simpleArrayColumns(event.metadata.columns)) {
            const val = entity[col.propertyName];
            if (val == null) {
                // Set [] để TypeORM lưu '' thay vì để Postgres áp DEFAULT '[]'.
                entity[col.propertyName] = [];
            } else if (Array.isArray(val)) {
                entity[col.propertyName] = val.filter((v) => !isJunk(v));
            }
        }
    }

    beforeUpdate(event: UpdateEvent<any>): void {
        const entity = event.entity as any;
        if (!entity) return;
        for (const col of simpleArrayColumns(event.metadata.columns)) {
            const val = entity[col.propertyName];
            if (Array.isArray(val)) {
                entity[col.propertyName] = val.filter((v) => !isJunk(v));
            }
        }
    }
}
