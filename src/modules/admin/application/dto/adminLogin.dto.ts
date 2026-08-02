import { Field, ObjectType } from "@/core/shared/decorators/graphQL.decorators";
import { AdminEntity } from "../../domain/entities/admin.entity";


@ObjectType('AdminLoginData')
export class AdminLoginData {
    @Field({ type: AdminEntity })
    admin!: AdminEntity;

    @Field({ type: String })
    token!: string;
}