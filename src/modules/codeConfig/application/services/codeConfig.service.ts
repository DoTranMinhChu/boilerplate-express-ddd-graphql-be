// src/modules/codeConfig/application/services/codeConfig.service.ts

import { BaseService } from '@/core/application/services/base.service';
import { CodeConfigEntity } from '../../domain/entities/codeConfig.entity';
import { CodeConfigRepository } from '../../infrastructure/persistence/codeConfig.repository';

import { ECodeEntityType } from '../enums/codeConfig.enum';
import { DeepPartial } from 'typeorm';
import { GlobalSequenceRepository } from '@/modules/globalSequence/domain/repositories/globalSequence.repository';

export const DEFAULT_CODE_CONFIGS: Record<ECodeEntityType, {
    prefix: string;
    separator: string;
    includeYear: boolean;
    sequenceLength: number;
}> = {
    [ECodeEntityType.ORDER]: { prefix: 'ORD', separator: '-', includeYear: true, sequenceLength: 5 },
    [ECodeEntityType.INVOICE]: { prefix: 'INV', separator: '-', includeYear: true, sequenceLength: 5 },
    [ECodeEntityType.DOCUMENT]: { prefix: 'DOC', separator: '-', includeYear: true, sequenceLength: 5 },
};

export const ALL_ENTITY_TYPES = Object.values(ECodeEntityType) as ECodeEntityType[];

export class CodeConfigService extends BaseService<CodeConfigEntity> {
    private codeConfigRepository: CodeConfigRepository;
    private globalSequenceRepository: GlobalSequenceRepository;

    constructor() {
        const repo = new CodeConfigRepository();
        super(repo, 'CodeConfig');
        this.codeConfigRepository = repo;
        this.globalSequenceRepository = new GlobalSequenceRepository();
    }

    // ── GENERATE CODE ─────────────────────────────────────────────────────────

    async generateCode(
        tenantId: string,
        agencyId: string,
        entityType: ECodeEntityType,
    ): Promise<string> {
        // 1. Lấy format config của tenant (không cần lock, không ảnh hưởng sequence)
        let config = await this.codeConfigRepository.findByTenantAndType(tenantId, entityType);

        if (!config) {
            const defaults = DEFAULT_CODE_CONFIGS[entityType] ?? {
                prefix: entityType, separator: '-', includeYear: true, sequenceLength: 5,
            };
            config = await this.codeConfigRepository.create({
                tenantId,
                agencyId,
                entityType,
                ...defaults,
                currentSequence: 0,
            });
        }

        // 2. Lấy sequence global — atomic INSERT, không bao giờ trùng
        const globalSeq = await this.globalSequenceRepository.nextval(entityType);

        // 3. Format: prefix của tenant + sequence global
        return this._formatCode(config, globalSeq);
    }

    // ── GET MY CONFIGS ────────────────────────────────────────────────────────

    /**
       * Tối ưu hóa: Lấy tất cả config của 1 tenant trong 1 lần query
       */
    async getMyCodeConfigs(tenantId: string, agencyId: string): Promise<CodeConfigEntity[]> {
        const existing = await this.codeConfigRepository.findByCondition({
            where: { tenantId },
        });

        const existingTypes = new Set(existing.map(c => c.entityType));
        const toCreate: DeepPartial<CodeConfigEntity>[] = [];

        for (const type of ALL_ENTITY_TYPES) {
            if (!existingTypes.has(type)) {
                toCreate.push({
                    tenantId,
                    agencyId,
                    entityType: type as ECodeEntityType,
                    ...DEFAULT_CODE_CONFIGS[type],
                    currentSequence: 0
                });
            }
        }

        if (toCreate.length > 0) {
            // Bulk insert thay vì vòng lặp
            await this.codeConfigRepository.createMany(toCreate);
            return this.codeConfigRepository.findByCondition({ where: { tenantId } });
        }

        return existing;
    }

    // ── UPSERT ────────────────────────────────────────────────────────────────

    async upsert(data: DeepPartial<CodeConfigEntity>): Promise<CodeConfigEntity> {
        const existing = await this.codeConfigRepository.findByTenantAndType(
            data.tenantId!,
            data.entityType as ECodeEntityType,
        );

        if (existing) {
            const { currentSequence: _ignored, ...safeData } = data as any;
            return this.codeConfigRepository.updateById(existing.id, safeData);
        }

        return this.codeConfigRepository.create({ ...data, currentSequence: 0 });
    }

    // ── INIT ──────────────────────────────────────────────────────────────────

    async initDefaultConfigs(tenantId: string, agencyId: string): Promise<CodeConfigEntity[]> {
        return this.getMyCodeConfigs(tenantId, agencyId);
    }

    async initAllTenantsDefaultConfigs(): Promise<{ tenantsProcessed: number; configsCreated: number }> {
        const allConfigs = await this.codeConfigRepository.findByCondition({ where: {} });
        const tenantSet = new Map<string, string>();
        for (const c of allConfigs) {
            if (!tenantSet.has(c.tenantId)) {
                tenantSet.set(c.tenantId, c.agencyId ?? c.tenantId);
            }
        }

        let configsCreated = 0;
        for (const [tenantId, agencyId] of tenantSet) {
            const before = await this.codeConfigRepository.countByCondition({ tenantId });
            await this.getMyCodeConfigs(tenantId, agencyId);
            const after = await this.codeConfigRepository.countByCondition({ tenantId });
            configsCreated += (after - before);
        }

        return { tenantsProcessed: tenantSet.size, configsCreated };
    }

    // ── PRIVATE ───────────────────────────────────────────────────────────────

    private _formatCode(config: CodeConfigEntity, sequence: number): string {
        const year = new Date().getFullYear();
        const yearShort = String(year).slice(-2);
        const seq = String(sequence).padStart(config.sequenceLength, '0');

        if (config.customPattern) {
            return config.customPattern
                .replace('{PREFIX}', config.prefix)
                .replace('{YEAR}', String(year))
                .replace('{YEAR_SHORT}', yearShort)
                .replace('{SEQ}', seq);
        }

        const parts = [config.prefix];
        if (config.includeYear) parts.push(String(year));
        parts.push(seq);
        return parts.join(config.separator);
    }
}