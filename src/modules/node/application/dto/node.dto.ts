import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { GraphQLMixed } from '@/core/shared/graphql/scalars';

@InputType('CreateNodeInput')
export class CreateNodeInput {
    @Field({ type: String }) pageId!: string;
    @Field({ type: String, nullable: true }) parentId?: string;
    @Field({ type: String }) type!: string;
    @Field({ type: Number, nullable: true }) order?: number;
    @Field({ type: String, nullable: true }) layoutMode?: 'flow' | 'free';
    @Field({ type: GraphQLMixed, nullable: true }) style?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) layout?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) props?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) dataBinding?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) repeat?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) visibilityRules?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) responsiveOverrides?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) animationRef?: Record<string, any>;
}

@InputType('UpdateNodeInput')
export class UpdateNodeInput {
    @Field({ type: String, nullable: true }) type?: string;
    @Field({ type: Number, nullable: true }) order?: number;
    @Field({ type: String, nullable: true }) layoutMode?: 'flow' | 'free';
    @Field({ type: GraphQLMixed, nullable: true }) style?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) layout?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) props?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) dataBinding?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) repeat?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) visibilityRules?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) responsiveOverrides?: Record<string, any>;
    @Field({ type: GraphQLMixed, nullable: true }) animationRef?: Record<string, any>;
}

@InputType('ReorderNodeItemInput')
export class ReorderNodeItemInput {
    @Field({ type: String }) id!: string;
    @Field({ type: Number }) order!: number;
}

@InputType('MoveNodeInput')
export class MoveNodeInput {
    @Field({ type: String }) id!: string;
    @Field({ type: String, nullable: true }) newParentId?: string;
    @Field({ type: Number }) newOrder!: number;
}
