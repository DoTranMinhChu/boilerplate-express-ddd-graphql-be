import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
import { Int } from '@/core/shared/graphql/scalars';
import { ECodeEntityType } from '../enums/codeConfig.enum';
import { BaseWithTenantInput } from '@/modules/tenant/application/dto/baseWithTenant.dto';

@InputType('UpdateCodeConfigInput')
export class UpdateCodeConfigInput extends BaseWithTenantInput {
    /** Loại entity áp dụng */
    @Field({ type: ECodeEntityType })
    entityType!: ECodeEntityType;

    /** Tiền tố của mã. VD: "ORD", "INV", "DOC" */
    @Field()
    prefix!: string;

    /** Ký tự ngăn cách. Mặc định "-" */
    @Field({ nullable: true })
    separator?: string;

    /** Có chèn năm vào mã không */
    @Field({ nullable: true })
    includeYear?: boolean;

    /** Số chữ số sequence. VD: 5 → 00001 */
    @Field({ type: Int, nullable: true })
    sequenceLength?: number;

    /** Pattern tùy chỉnh. VD: "{PREFIX}-{YEAR_SHORT}{SEQ}" */
    @Field({ nullable: true })
    customPattern?: string;
}

@InputType('CreateCodeConfigInput')
export class CreateCodeConfigInput extends UpdateCodeConfigInput {}
