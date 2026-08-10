import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';

@InputType('CreateMenuInput')
export class CreateMenuInput {
    @Field({ type: String }) name!: string;
}

@InputType('UpdateMenuInput')
export class UpdateMenuInput {
    @Field({ type: String, nullable: true }) name?: string;
}
