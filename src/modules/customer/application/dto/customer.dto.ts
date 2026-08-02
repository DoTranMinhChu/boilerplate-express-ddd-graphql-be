import { Field, InputType, ObjectType } from '@/core/shared/decorators/graphQL.decorators';
import { CustomerEntity } from '../../domain/entities/customer.entity';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';
@InputType('CreateCustomerInput')
export class CreateCustomerInput extends CustomerEntity {

}
@InputType('UpdateCustomerInput')
export class UpdateCustomerInput extends CustomerEntity {

}
@ObjectType('CustomerStats')
export class CustomerStatsType {
    @Field()
    total!: number;

    @Field()
    identified!: number;

    @Field()
    anonymous!: number;

    @Field({ type: GraphQLMixed })
    conversionRate!: number;
}