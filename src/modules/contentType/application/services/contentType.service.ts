import { ContentTypeEntity } from '../../domain/entities/contentType.entity';
import { ContentTypeRepository } from '../../infrastructure/persistence/contentType.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException } from '@/core/domain/exceptions/appException';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { EFieldType } from '@/modules/contentType/application/enums/contentType.enum';
import { slugify } from '@/core/shared/utils/slug.util';
import { DeepPartial } from 'typeorm';

export class ContentTypeService extends BaseService<ContentTypeEntity> {
    constructor(private readonly contentTypeRepository = new ContentTypeRepository()) {
        super(contentTypeRepository, 'ContentType');
    }

    /** depth 0 = field cấp cao nhất của ContentType, depth 1 = itemFields của 1
     * REPEATER cấp cao nhất. Không cho REPEATER lồng REPEATER (depth >= 1 mà vẫn
     * gặp type REPEATER) — khớp giới hạn "1 cấp" đã ghi ở FieldDefinitionType.itemFields
     * doc comment và ContentTypeService.fragment (FE) chỉ fetch itemFields 1 cấp. Nếu
     * cho lồng sâu hơn mà không tăng độ sâu fetch ở FE tương ứng thì dữ liệu cấp 2 trở
     * xuống sẽ bị mất khi FE đọc lại rồi lưu đè (đã xảy ra thật, xem final review Phase 2a). */
    private assertUniqueFieldKeys(fields: FieldDefinitionType[] = [], depth = 0): void {
        const seen = new Set<string>();
        for (const f of fields) {
            if (seen.has(f.key)) {
                throw new ConflictException(`Field key "${f.key}" bị lặp lại trong content type.`);
            }
            seen.add(f.key);
            if (f.type === EFieldType.REPEATER && f.itemFields?.length) {
                if (depth >= 1) {
                    throw new ConflictException(`Field "${f.key}": không hỗ trợ Danh sách lặp lại (REPEATER) lồng bên trong 1 REPEATER khác.`);
                }
                this.assertUniqueFieldKeys(f.itemFields as FieldDefinitionType[], depth + 1);
            }
        }
    }

    async createContentType(data: DeepPartial<ContentTypeEntity>): Promise<ContentTypeEntity> {
        const key = slugify(data.key as string) || slugify(data.label as string);
        const existing = await this.contentTypeRepository.findOneByCondition({ where: { key } });
        if (existing) throw new ConflictException(`Content type key "${key}" đã tồn tại.`);
        this.assertUniqueFieldKeys(data.fields as FieldDefinitionType[]);
        return this.create({ ...data, key });
    }

    async updateContentType(id: string, data: DeepPartial<ContentTypeEntity>): Promise<ContentTypeEntity> {
        if (data.fields) this.assertUniqueFieldKeys(data.fields as FieldDefinitionType[]);
        return this.updateById(id, data);
    }
}
