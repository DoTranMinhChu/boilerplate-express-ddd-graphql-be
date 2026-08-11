import { BaseEntity } from '@/core/domain/entities/base.entity';
import { Entity, Column, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { TenantEntity } from '@/modules/tenant/domain/entities/tenant.entity';
import { EAuthProvider } from '@/modules/customer/domain/enums/customer.enum';


@ObjectType('Customer')
@Entity('customer')
export class CustomerEntity extends BaseEntity {
    // NULLABLE (khác thiết kế NOT NULL ban đầu của Task 7) -- phát hiện lúc QA thủ công Task 9's
    // registerCustomer thật: Customer membership (Phase 4 mục 3) là đăng ký CÔNG KHAI, không có
    // context tenant nào để gán (registerCustomer/loginCustomer không nhận tenantId, đúng interface
    // Task 9 brief) -- cột NOT NULL kế thừa từ khuôn boilerplate multi-tenant Merchant/Agency/Tenant
    // (nơi tenantId luôn có sẵn qua identity switch) không áp dụng cho luồng khách tự đăng ký này.
    // Bảng customer hiện có 0 row (xem comment ở authProvider dưới) -- nới NOT NULL -> nullable an
    // toàn 100%, không có row cũ nào bị ảnh hưởng.
    @Field({ type: String, nullable: true })
    @Column({ name: 'tenantId', nullable: true })
    @Index()
    tenantId?: string;

    @ManyToOne(() => TenantEntity, { nullable: true })
    @JoinColumn({ name: 'tenantId' })
    tenant?: TenantEntity;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    fullname?: string;

    // Unique + nullable cùng lúc hợp lệ ở Postgres (nhiều NULL được phép, chỉ chặn trùng giá trị
    // KHÔNG null) -- an toàn cho row cũ (nếu có) chưa từng có email.
    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    @Index({ unique: true })
    email?: string;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    phone?: string;

    // KHÔNG lộ qua GraphQL (giống Merchant.password) -- nullable vì khách đăng nhập Google không có password.
    @Column({ nullable: true })
    password?: string;

    // Cột NOT NULL MỚI trên entity ĐÃ TỒN TẠI -- SQL default hằng số (bảng customer hiện có 0 row
    // nên không có rủi ro backfill thật, nhưng vẫn thêm default theo convention dự án -- bảng dev
    // tích luỹ dữ liệu theo thời gian, xem feedback_notnull_column_needs_sql_default).
    @Field({ type: EAuthProvider })
    @Column({ default: EAuthProvider.PASSWORD })
    authProvider!: EAuthProvider;

    @Field({ type: String, nullable: true })
    @Column({ nullable: true })
    @Index({ unique: true })
    googleId?: string;

    @Field({ type: Boolean })
    @Column({ default: true })
    isActivated!: boolean;

    @Column({ nullable: true })
    resetPasswordToken?: string;

    @Column({ type: 'timestamp', nullable: true })
    resetPasswordExpires?: Date;
}
