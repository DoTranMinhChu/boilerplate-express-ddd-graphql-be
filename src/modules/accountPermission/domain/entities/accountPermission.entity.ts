// src/modules/accountPermission/domain/entities/accountPermission.entity.ts

import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ObjectType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { BaseWithTenantEntity } from '@/modules/tenant/domain/entities/baseWithTenant.entity';
import { EAccountPermissionScope } from '../enums/accountPermission.enum';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { ScopeRule } from '@/modules/permission/types/scope.types';
import { TenantAccountEntity } from '@/modules/tenantAccount/domain/entities/tenantAccount.entity';

@ObjectType('AccountPermission')
@Entity('accountPermission')
export class AccountPermissionEntity extends BaseWithTenantEntity {

    @Field()
    @Column({ nullable: true })
    @Index()
    tenantAccountId!: string;

    @Field({ type: () => TenantAccountEntity })
    @ManyToOne(() => TenantAccountEntity)
    @JoinColumn({ name: 'tenantAccountId' })
    tenantAccount!: TenantAccountEntity;

    @Field({ type: EAccountPermissionScope })
    @Column({ type: 'varchar', default: EAccountPermissionScope.TENANT })
    accountScope!: EAccountPermissionScope;

    @Field({ type: EPermission })
    @Column({ type: 'varchar' })
    @Index()
    permission!: EPermission;

    /**
     * IScopeRule — lưu dạng JSONB, tự mô tả hoàn toàn.
     *
     * Ví dụ:
     *   { type: 'ALLOW_ALL' }
     *   { type: 'INCLUDE', field: 'productionUnitId', ids: ['u1','u2'] }
     *   { type: 'SELF', field: 'createdByTenantAccountId' }
     *   { type: 'EXCLUDE', field: 'id', ids: ['p1'] }
     *   { type: 'OR', rules: [
     *       { type: 'INCLUDE', field: 'productionUnitId', ids: ['u1'] },
     *       { type: 'SELF', field: 'createdByTenantAccountId' }
     *   ]}
     */
    @Field({ type: () => ScopeRule })
    @Column({ type: 'jsonb', nullable: false, default: () => `'{"type":"DENY_ALL"}'` })
    scopeRule!: ScopeRule;
}