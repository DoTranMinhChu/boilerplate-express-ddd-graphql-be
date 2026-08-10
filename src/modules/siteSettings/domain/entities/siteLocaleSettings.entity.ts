import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

// SINGLETON THẬT — đúng 1 bản ghi tồn tại (khác isDefault/setDefault của Header/FooterPreset, vốn
// cho phép NHIỀU bản ghi với 1 cờ default). SiteLocaleSettingsService.getSettings() tự tạo bản ghi
// đầu nếu chưa có, KHÔNG có mutation "create" riêng — chỉ có "update" (upsert ngầm).
@ObjectType('SiteLocaleSettings')
@Entity('site_locale_settings')
export class SiteLocaleSettingsEntity extends BaseEntity {
    @Field({ type: GraphQLMixed })
    @Column({ type: 'jsonb', default: ['vi'] })
    enabledLocales!: string[];

    @Field({ type: String })
    @Column({ default: 'vi' })
    defaultLocale!: string;
}
