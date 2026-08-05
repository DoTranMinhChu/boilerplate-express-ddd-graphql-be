import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@InputType('CreateHeaderPresetInput')
export class CreateHeaderPresetInput {
    @Field({ type: String }) name!: string;
    @Field({ type: String, nullable: true }) logoText?: string;
    @Field({ type: GraphQLMixed, nullable: true }) navLinks?: { label: string; href: string }[];
    @Field({ type: GraphQLMixed, nullable: true }) animation?: any[];
}

@InputType('UpdateHeaderPresetInput')
export class UpdateHeaderPresetInput {
    @Field({ type: String, nullable: true }) name?: string;
    @Field({ type: String, nullable: true }) logoText?: string;
    @Field({ type: GraphQLMixed, nullable: true }) navLinks?: { label: string; href: string }[];
    @Field({ type: GraphQLMixed, nullable: true }) animation?: any[];
}
