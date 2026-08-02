import { Entity, Column, Index } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { BaseWithTenantEntity } from '@/modules/tenant/domain/entities/baseWithTenant.entity';
import { Int } from '@/core/shared/graphql/scalars';
import { ECodeEntityType } from '../../application/enums/codeConfig.enum';

/**
 * Cấu hình sinh mã tự động cho từng loại entity theo tenant.
 * Mỗi tenant có thể tùy chỉnh prefix, separator, định dạng năm, độ dài sequence.
 *
 * VD: Tenant A muốn ORD-2026-00001, Tenant B muốn COOP-ORD-26-001.
 * Khi cần thêm loại mã mới: thêm row vào bảng, không sửa code.
 *
 * Business Rules:
 *  - Mỗi (tenantId, entityType) chỉ có tối đa 1 config.
 *  - currentSequence chỉ tăng, không bao giờ giảm (atomic increment).
 *  - Nếu không có config cho entityType: fallback về pattern mặc định.
 */
@ObjectType('CodeConfig')
@Entity('codeConfig')
@Index(['tenantId', 'entityType'], { unique: true })
export class CodeConfigEntity extends BaseWithTenantEntity {

    /** Loại entity áp dụng. VD: ORDER, INVOICE, DOCUMENT */
    @Field({ type: ECodeEntityType })
    @Column({ type: 'varchar' })
    entityType!: ECodeEntityType;

    /** Tiền tố của mã. VD: "ORD", "INV", "DOC". Uppercase */
    @Field()
    @Column({ type: 'varchar', length: 20 })
    prefix!: string;

    /** Ký tự ngăn cách giữa các phần. Mặc định "-" */
    @Field()
    @Column({ type: 'varchar', length: 5, default: '-' })
    separator!: string;

    /** Có chèn năm vào mã không? VD: true → ORD-2026-00001 */
    @Field()
    @Column({ type: 'boolean', default: true })
    includeYear!: boolean;

    /** Số chữ số của phần sequence. VD: 5 → 00001, 00002... */
    @Field({ type: Int })
    @Column({ type: 'int', default: 5 })
    sequenceLength!: number;

    /**
     * Số thứ tự hiện tại. Tăng 1 mỗi lần sinh mã.
     * Sử dụng atomic increment để tránh trùng lặp khi concurrent.
     */
    @Field({ type: Int })
    @Column({ type: 'int', default: 0 })
    currentSequence!: number;

    /**
     * Pattern tùy chỉnh nếu muốn ghi đè toàn bộ logic mặc định.
     * Biến hỗ trợ: {PREFIX}, {YEAR}, {YEAR_SHORT}, {SEQ}
     * VD: "{PREFIX}-{YEAR_SHORT}{SEQ}" → ORD-2600001
     */
    @Field()
    @Column({ type: 'varchar', length: 100, nullable: true })
    customPattern?: string;
}
