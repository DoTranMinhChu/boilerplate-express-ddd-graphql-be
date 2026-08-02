import 'reflect-metadata';
import { EDeletionMode, ECascadeAction } from '@/core/domain/enums/deletionPolicy.enum';

export const DELETION_POLICY_METADATA = Symbol('deletion_policy_metadata');
export const CASCADE_CHILD_METADATA = Symbol('cascade_child_metadata');

export interface IDeletionPolicyOptions {
    /**
     * NONE bị DeletionService chặn cứng (không cho xóa mềm lẫn cứng).
     * SOFT/HARD hiện tại chỉ mang tính khai báo/tài liệu — service nào gọi
     * softDeleteById hay deleteById vẫn tự quyết, framework không ép buộc.
     */
    mode: EDeletionMode;
}

export interface ICascadeChildOptions {
    target: () => Function;
    foreignKey: string;
    onSoftDelete: ECascadeAction;
    onHardDelete: ECascadeAction;
}

export interface ICascadeChildMetadata extends ICascadeChildOptions {
    parentName: string;
}

export function DeletionPolicy(options: IDeletionPolicyOptions): ClassDecorator {
    return (target: Function) => {
        Reflect.defineMetadata(DELETION_POLICY_METADATA, options, target);
    };
}

export function CascadeChild(options: ICascadeChildOptions): ClassDecorator {
    return (target: Function) => {
        // Class decorators chạy từ dưới lên (bottom-up) — unshift để thứ tự trả về
        // khớp với thứ tự viết trong code (trên xuống dưới), dễ đọc hơn khi debug.
        const existing: ICascadeChildMetadata[] =
            Reflect.getOwnMetadata(CASCADE_CHILD_METADATA, target) || [];
        existing.unshift({ ...options, parentName: target.name });
        Reflect.defineMetadata(CASCADE_CHILD_METADATA, existing, target);
    };
}

export function getDeletionPolicy(entityClass: Function): IDeletionPolicyOptions | undefined {
    return Reflect.getMetadata(DELETION_POLICY_METADATA, entityClass);
}

export function getCascadeChildren(entityClass: Function): ICascadeChildMetadata[] {
    return Reflect.getOwnMetadata(CASCADE_CHILD_METADATA, entityClass) || [];
}
