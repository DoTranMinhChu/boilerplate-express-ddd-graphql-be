import { InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { EMenuItemTargetType } from '@/modules/menu/application/enums/menuItem.enum';

@InputType('CreateMenuItemInput')
export class CreateMenuItemInput {
    @Field({ type: String }) menuId!: string;
    @Field({ type: String, nullable: true }) parentId?: string;
    @Field({ type: Number, nullable: true }) order?: number;
    @Field({ type: String }) label!: string;
    @Field({ type: EMenuItemTargetType }) targetType!: EMenuItemTargetType;
    @Field({ type: String, nullable: true }) pageId?: string;
    @Field({ type: String, nullable: true }) url?: string;
    @Field({ type: String, nullable: true }) anchor?: string;
}

@InputType('UpdateMenuItemInput')
export class UpdateMenuItemInput {
    @Field({ type: String, nullable: true }) parentId?: string;
    @Field({ type: Number, nullable: true }) order?: number;
    @Field({ type: String, nullable: true }) label?: string;
    @Field({ type: EMenuItemTargetType, nullable: true }) targetType?: EMenuItemTargetType;
    @Field({ type: String, nullable: true }) pageId?: string;
    @Field({ type: String, nullable: true }) url?: string;
    @Field({ type: String, nullable: true }) anchor?: string;
}
