import { Field, ObjectType } from "@/core/shared/decorators/graphQL.decorators";
import { EAccountSource, ERole } from "@/core/shared/enums/account.enum";
import { AgencyEntity } from "@/modules/agency/domain/entities/agency.entity";
import { TenantEntity } from "@/modules/tenant/domain/entities/tenant.entity";
import { TenantAccountEntity } from "@/modules/tenantAccount/domain/entities/tenantAccount.entity";



@ObjectType('TenantAccountLogin')
export class TenantAccountLogin {
    @Field({ type: () => TenantAccountEntity })
    tenantAccount!: TenantAccountEntity;

    @Field({ type: String })
    token!: string;

    @Field({ type: () => TenantEntity })
    tenant!: TenantEntity;

    @Field({ type: () => AgencyEntity })
    agency!: AgencyEntity;

    @Field({ type: EAccountSource })
    source!: EAccountSource



    @Field({ type: [ERole] })
    roles!: ERole[];
}