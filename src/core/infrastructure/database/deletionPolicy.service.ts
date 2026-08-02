import { DataSource } from 'typeorm';
import {
    getDeletionPolicy,
    getCascadeChildren,
} from '@/core/shared/decorators/deletionPolicy.decorator';
import { EDeletionMode, ECascadeAction } from '@/core/domain/enums/deletionPolicy.enum';
import { ConflictException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { Logger } from '@/core/shared/utils/Logger';
import { AppDataSource } from '@/config/database.config';

const logger = Logger.getInstance();

type TMode = 'SOFT' | 'HARD';

/** Metadata tối thiểu của 1 quan hệ ManyToOne — dùng để tự dò quan hệ CHƯA khai báo @CascadeChild. */
export interface IRelationMetadataLike {
    relationType: string;
    inverseEntityMetadata?: { target: Function | string };
    joinColumns?: { propertyName: string; isNullable?: boolean }[];
}

export interface IEntityMetadataLike {
    target: Function | string;
    relations?: IRelationMetadataLike[];
}

/** Tập con tối thiểu của DataSource mà DeletionService dùng — cho phép test bằng fake. */
export interface IDeletionDataSourceLike {
    createQueryRunner: () => {
        connect: () => Promise<void>;
        startTransaction: () => Promise<void>;
        commitTransaction: () => Promise<void>;
        rollbackTransaction: () => Promise<void>;
        release: () => Promise<void>;
        manager: {
            getRepository: (target: Function) => any;
            /** Chỉ cần khi muốn dùng auto-default nullable-aware lúc HARD delete — bỏ qua an toàn nếu không có (fake test). */
            connection?: { entityMetadatas: readonly IEntityMetadataLike[] };
        };
    };
}

export class DeletionService {
    static async softDelete(
        entityClass: Function,
        id: string,
        dataSourceLike: IDeletionDataSourceLike = AppDataSource,
    ): Promise<void> {
        return this.execute(entityClass, id, 'SOFT', dataSourceLike);
    }

    static async hardDelete(
        entityClass: Function,
        id: string,
        dataSourceLike: IDeletionDataSourceLike = AppDataSource,
    ): Promise<void> {
        return this.execute(entityClass, id, 'HARD', dataSourceLike);
    }

    private static async execute(
        entityClass: Function,
        id: string,
        mode: TMode,
        dataSourceLike: IDeletionDataSourceLike,
    ): Promise<void> {
        const policy = getDeletionPolicy(entityClass);
        if (policy?.mode === EDeletionMode.NONE) {
            throw new ConflictException(
                `"${entityClass.name}" là bảng append-only, không được phép xóa.`,
                EErrorCode.DELETION_FORBIDDEN_APPEND_ONLY,
                { entityName: entityClass.name },
            );
        }

        const queryRunner = dataSourceLike.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            await this.cascadeAndDelete(queryRunner, entityClass, id, mode);
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    private static async cascadeAndDelete(
        queryRunner: ReturnType<IDeletionDataSourceLike['createQueryRunner']>,
        entityClass: Function,
        id: string,
        mode: TMode,
    ): Promise<void> {
        const declaredChildren = getCascadeChildren(entityClass);

        for (const declared of declaredChildren) {
            const childTarget = declared.target();
            const action = mode === 'SOFT' ? declared.onSoftDelete : declared.onHardDelete;
            const childRepo = queryRunner.manager.getRepository(childTarget);

            switch (action) {
                case ECascadeAction.NO_CASCADE:
                    continue;
                case ECascadeAction.RESTRICT: {
                    const count = await childRepo.count({ where: { [declared.foreignKey]: id } });
                    if (count > 0) {
                        throw new ConflictException(
                            `Không thể xóa "${entityClass.name}" vì còn ${count} bản ghi "${childTarget.name}" đang tham chiếu qua "${declared.foreignKey}".`,
                            EErrorCode.DELETION_RESTRICTED,
                            { entityName: entityClass.name, childEntity: childTarget.name, foreignKey: declared.foreignKey, count },
                        );
                    }
                    continue;
                }
                case ECascadeAction.SET_NULL:
                    await childRepo.update(
                        { [declared.foreignKey]: id },
                        { [declared.foreignKey]: null },
                    );
                    continue;
                case ECascadeAction.CASCADE_SOFT:
                case ECascadeAction.CASCADE_HARD: {
                    const childMode: TMode = action === ECascadeAction.CASCADE_SOFT ? 'SOFT' : 'HARD';
                    const isLeaf = getCascadeChildren(childTarget).length === 0;

                    // Leaf + SOFT: no further descendants to recurse into, and SOFT delete has
                    // no per-row dangling-reference check (the parent row still exists — see the
                    // comment on the HARD-mode auto-default block below). Safe to collapse what
                    // would otherwise be N sequential awaited queries (one per child) into a
                    // single bulk UPDATE.
                    if (isLeaf && childMode === 'SOFT') {
                        await childRepo.softDelete({ [declared.foreignKey]: id });
                        continue;
                    }

                    // Otherwise still need per-row handling — HARD delete runs a per-id
                    // dangling-reference check, and non-leaf children must recurse into their
                    // own declared cascades. Only fetch the id column to cut payload size.
                    const children = await childRepo.find({
                        where: { [declared.foreignKey]: id },
                        select: ['id'],
                    });
                    for (const child of children) {
                        await this.cascadeAndDelete(queryRunner, childTarget, child.id, childMode);
                    }
                    continue;
                }
            }
        }

        if (declaredChildren.length === 0) {
            logger.warn(
                `[DeletionPolicy] "${entityClass.name}" không có @CascadeChild nào được khai báo — xóa trực tiếp, không cascade.`,
            );
        }

        // ── Auto-default cho quan hệ CHƯA khai báo @CascadeChild — chỉ áp dụng khi HARD delete ──
        // Quy luật: FK nullable (tùy chọn) → SET_NULL (gỡ liên kết, coi mồ côi là hợp lệ);
        // FK bắt buộc (not null) → RESTRICT (chặn, tránh để lại tham chiếu treo tới bản ghi
        // đã bị xóa hẳn). KHÔNG áp dụng cho SOFT delete: bản ghi cha vẫn còn trong DB (chỉ ẩn),
        // nên không có rủi ro tham chiếu treo — hành vi mặc định vẫn là NO_CASCADE (giữ nguyên,
        // đã cảnh báo ở trên) để không cascade quá tay ngoài dự tính (vd Tenant).
        if (mode === 'HARD') {
            const declaredTargets = new Set(declaredChildren.map(c => c.target()));
            const entityMetadatas = queryRunner.manager.connection?.entityMetadatas ?? [];
            for (const otherMeta of entityMetadatas) {
                if (typeof otherMeta.target !== 'function') continue;
                const otherTarget = otherMeta.target;
                if (declaredTargets.has(otherTarget)) continue;
                if (otherTarget === entityClass) continue;
                for (const rel of otherMeta.relations ?? []) {
                    if (rel.relationType !== 'many-to-one') continue;
                    if (rel.inverseEntityMetadata?.target !== entityClass) continue;
                    const joinCol = rel.joinColumns?.[0];
                    if (!joinCol) continue;

                    const childRepo = queryRunner.manager.getRepository(otherTarget);
                    if (joinCol.isNullable) {
                        await childRepo.update(
                            { [joinCol.propertyName]: id },
                            { [joinCol.propertyName]: null },
                        );
                    } else {
                        const count = await childRepo.count({ where: { [joinCol.propertyName]: id } });
                        if (count > 0) {
                            throw new ConflictException(
                                `Không thể xóa cứng "${entityClass.name}" vì còn ${count} bản ghi "${otherTarget.name}" ` +
                                `đang tham chiếu bắt buộc qua "${joinCol.propertyName}" (chưa khai báo @CascadeChild).`,
                                EErrorCode.DELETION_RESTRICTED_AUTO,
                                { entityName: entityClass.name, childEntity: otherMeta.target.name, foreignKey: joinCol.propertyName, count },
                            );
                        }
                    }
                }
            }
        }

        const repo = queryRunner.manager.getRepository(entityClass);
        if (mode === 'SOFT') {
            await repo.softDelete(id);
        } else {
            await repo.delete(id);
        }
    }

    static validateRegistryAtBootstrap(dataSource: DataSource): void {
        for (const meta of dataSource.entityMetadatas) {
            const entityClass = meta.target as Function;
            if (typeof entityClass !== 'function') continue;

            const declared = getCascadeChildren(entityClass);
            for (const child of declared) {
                const childTarget = child.target();
                const childMeta = dataSource.entityMetadatas.find(m => m.target === childTarget);
                if (!childMeta) {
                    throw new Error(
                        `[DeletionPolicy] "${entityClass.name}" khai báo @CascadeChild target() trả về ` +
                        `"${(childTarget as any)?.name ?? childTarget}" nhưng entity này không tồn tại trong AppDataSource.`,
                    );
                }
                const hasMatchingColumn = childMeta.columns.some(c => c.propertyName === child.foreignKey);
                if (!hasMatchingColumn) {
                    throw new Error(
                        `[DeletionPolicy] "${entityClass.name}" khai báo @CascadeChild({ target: () => ${childMeta.name}, ` +
                        `foreignKey: '${child.foreignKey}' }) nhưng "${childMeta.name}" không có cột "${child.foreignKey}".`,
                    );
                }
            }
        }
    }
}
