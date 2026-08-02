import { AppDataSource } from '@/config/database.config';
import { ABaseRepository } from '@/core/infrastructure/database/base.abstract.repository';
import { CodeConfigEntity } from '../../domain/entities/codeConfig.entity';
import { ECodeEntityType } from '../../application/enums/codeConfig.enum';

export class CodeConfigRepository extends ABaseRepository<CodeConfigEntity> {
    constructor() {
        super(AppDataSource.getRepository(CodeConfigEntity));
    }

    /**
     * Tìm config theo tenantId + entityType.
     * Mỗi tenant chỉ có 1 config per entityType.
     */
    async findByTenantAndType(tenantId: string, entityType: ECodeEntityType): Promise<CodeConfigEntity | null> {
        return this.findOneByCondition({
            where: { tenantId, entityType },
        });
    }

    /**
     * Atomic increment currentSequence và trả về giá trị mới.
     * Dùng raw SQL UPDATE ... RETURNING để tránh race condition.
     */
    async incrementAndGetSequence(configId: string): Promise<number> {
        const result = await this.repository
            .createQueryBuilder()
            .update(CodeConfigEntity)
            .set({ currentSequence: () => '"currentSequence" + 1' })
            .where('id = :id', { id: configId })
            .returning('"currentSequence"')
            .execute();

        return result.raw[0].currentSequence;
    }
}
