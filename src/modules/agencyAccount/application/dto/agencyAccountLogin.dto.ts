import { Field, ObjectType } from "@/core/shared/decorators/graphQL.decorators";
import { AgencyAccountEntity } from "../../domain/entities/agencyAccount.entity";
import { AgencyEntity } from "@/modules/agency/domain/entities/agency.entity";
import { ERole } from "@/core/shared/enums/account.enum";


@ObjectType('AgencyAccountLoginData')
export class AgencyAccountLoginData {
    @Field({ type: AgencyAccountEntity })
    agencyAccount!: AgencyAccountEntity;

    @Field({ type: String })
    token!: string;


    @Field({ type: () => AgencyEntity })
    agency!: AgencyEntity;

    @Field({ type: [ERole] })
    roles!: ERole[];
}