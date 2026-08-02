import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
import { EUnitGroup } from '../enums/unit.enum';

@InputType('UpdateUnitInput')
export class UpdateUnitInput {
    @Field()
    name!: string;

    @Field()
    code!: string;

    @Field({ type: EUnitGroup, nullable: true })
    group?: EUnitGroup;

    @Field({ nullable: true })
    description?: string;

    @Field({ nullable: true })
    isActivated?: boolean;
}

@InputType('CreateUnitInput')
export class CreateUnitInput extends UpdateUnitInput {}
