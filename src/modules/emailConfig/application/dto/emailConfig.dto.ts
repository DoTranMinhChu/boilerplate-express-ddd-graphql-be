import { Field, InputType } from '@/core/shared/decorators/graphQL.decorators';
import { Int } from '@/core/shared/graphql/scalars';
import { DEFAULT_RESET_PASSWORD_TEMPLATE } from '../../domain/entities/emailConfig.entity';

@InputType('CreateEmailConfigInput')
export class CreateEmailConfigInput {
    @Field({ type: String })
    name!: string;

    @Field({ type: String, nullable: true })
    domain?: string;

    @Field({ type: Boolean, nullable: true })
    isDefault?: boolean;

    @Field({ type: Boolean, nullable: true })
    isActive?: boolean;

    @Field({ type: String })
    smtpHost!: string;

    @Field({ type: Int, nullable: true })
    smtpPort?: number;

    @Field({ type: Boolean, nullable: true })
    smtpSecure?: boolean;

    @Field({ type: String })
    smtpUser!: string;

    @Field({ type: String })
    smtpPassword!: string;

    @Field({ type: String })
    senderName!: string;

    @Field({ type: String })
    senderEmail!: string;

    @Field({ type: String, nullable: true })
    resetPasswordSubject?: string;

    @Field({ type: String, nullable: true })
    resetPasswordTemplate?: string;

}

@InputType('UpdateEmailConfigInput')
export class UpdateEmailConfigInput {
    @Field({ type: String, nullable: true })
    name?: string;

    @Field({ type: String, nullable: true })
    domain?: string;

    @Field({ type: Boolean, nullable: true })
    isDefault?: boolean;

    @Field({ type: Boolean, nullable: true })
    isActive?: boolean;

    @Field({ type: String, nullable: true })
    smtpHost?: string;

    @Field({ type: Int, nullable: true })
    smtpPort?: number;

    @Field({ type: Boolean, nullable: true })
    smtpSecure?: boolean;

    @Field({ type: String, nullable: true })
    smtpUser?: string;

    @Field({ type: String, nullable: true })
    smtpPassword?: string;

    @Field({ type: String, nullable: true })
    senderName?: string;

    @Field({ type: String, nullable: true })
    senderEmail?: string;

    @Field({ type: String, nullable: true })
    resetPasswordSubject?: string;

    @Field({ type: String, nullable: true })
    resetPasswordTemplate?: string;
}
