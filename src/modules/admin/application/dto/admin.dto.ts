import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
import { AdminEntity } from '../../domain/entities/admin.entity';

@InputType()
export class CreateAdminInput extends AdminEntity {
    @Field() email!: string;
    @Field() password!: string;
}



@InputType()
export class UpdateAdminInput extends AdminEntity {
    @Field() email!: string;
    @Field() password!: string;
}
