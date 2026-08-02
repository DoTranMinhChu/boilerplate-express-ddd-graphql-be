import { Field, InputType } from "../decorators/graphQL.decorators";

@InputType('SwitchAgencyInput')
export class SwitchAgencyInput {
    @Field({ type: String })
    agencyCode!: string;
}
@InputType('SwitchTenantInput')
export class SwitchTenantInput {
    @Field({ type: String })
    tenantCode!: string;
}

@InputType('LoginInput')
export class LoginInput {
    @Field({ type: String, nullable: true })
    code?: string;

    @Field({ type: String })
    username!: string;

    @Field({ type: String })
    password!: string;
}

@InputType('ChangePasswordInput')
export class ChangePasswordInput {
    @Field({ type: String })
    oldPassword!: string;

    @Field({ type: String })
    newPassword!: string;
}

@InputType('ResetPasswordInput')
export class ResetPasswordInput {
    @Field({ type: String })
    targetId!: string;

    @Field({ type: String })
    newPassword!: string;
}

@InputType('ForgotPasswordInput')
export class ForgotPasswordInput {
    /** Username hoặc email đều được chấp nhận */
    @Field({ type: String })
    login!: string;

    /**
     * Origin đầy đủ của FE, lấy từ window.location.origin
     * VD: "https://admin.example.com", "https://app.example.com"
     * BE dùng để:
     *   1. Tìm EmailConfig phù hợp (match theo hostname)
     *   2. Tạo reset link: ${origin}${config.resetPasswordPath}?token=...
     */
    @Field({ type: String, nullable: true })
    domain?: string;
}

@InputType('ForgotPasswordResetInput')
export class ForgotPasswordResetInput {
    @Field({ type: String })
    token!: string;

    @Field({ type: String })
    newPassword!: string;
}
