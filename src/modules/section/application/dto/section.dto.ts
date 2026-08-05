import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@InputType('CreateSectionInput')
export class CreateSectionInput {
    @Field({ type: String }) pageId!: string;
    @Field({ type: String }) type!: string;
    @Field({ type: Number, nullable: true }) order?: number;
    @Field({ type: Boolean, nullable: true }) enabled?: boolean;
    @Field({ type: String, nullable: true }) layoutPreset?: string;
    @Field({ type: String, nullable: true }) theme?: string;
    @Field({ type: GraphQLMixed, nullable: true }) content?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) dataSource?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) fieldMapping?: Record<string, string>;
    @Field({ type: GraphQLMixed, nullable: true }) visibilityRules?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) responsiveSettings?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) animation?: any[];
    @Field({ type: GraphQLMixed, nullable: true }) style?: Record<string, any>;
}

@InputType('UpdateSectionInput')
export class UpdateSectionInput {
    @Field({ type: String, nullable: true }) type?: string;
    @Field({ type: Number, nullable: true }) order?: number;
    @Field({ type: Boolean, nullable: true }) enabled?: boolean;
    @Field({ type: String, nullable: true }) layoutPreset?: string;
    @Field({ type: String, nullable: true }) theme?: string;
    @Field({ type: GraphQLMixed, nullable: true }) content?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) dataSource?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) fieldMapping?: Record<string, string>;
    @Field({ type: GraphQLMixed, nullable: true }) visibilityRules?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) responsiveSettings?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) animation?: any[];
    @Field({ type: GraphQLMixed, nullable: true }) style?: Record<string, any>;
}

@InputType('ReorderSectionItemInput')
export class ReorderSectionItemInput {
    @Field({ type: String }) id!: string;
    @Field({ type: Number }) order!: number;
}
