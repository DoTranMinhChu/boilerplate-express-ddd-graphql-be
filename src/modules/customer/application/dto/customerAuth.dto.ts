// src/modules/customer/application/dto/customerAuth.dto.ts
//
// DTO cho public auth flow của Customer (Phase 4, mục 3, Task 10) — tách riêng khỏi
// customer.dto.ts (nơi chỉ có CRUD input CreateCustomerInput/UpdateCustomerInput) vì đây là
// input/output cho mutation đăng ký/đăng nhập/quên mật khẩu, không liên quan tới CRUD entity.
import { ObjectType, InputType, Field } from '@/core/shared/decorators/graphQL.decorators';
import { CustomerEntity } from '../../domain/entities/customer.entity';

@InputType('RegisterCustomerInput')
export class RegisterCustomerInput {
    @Field({ type: String }) email!: string;
    @Field({ type: String }) password!: string;
    @Field({ type: String, nullable: true }) fullname?: string;
    @Field({ type: String, nullable: true }) phone?: string;
}

@InputType('LoginCustomerInput')
export class LoginCustomerInput {
    @Field({ type: String }) email!: string;
    @Field({ type: String }) password!: string;
}

@ObjectType('CustomerLoginData')
export class CustomerLoginData {
    @Field({ type: () => CustomerEntity }) customer!: CustomerEntity;
    @Field({ type: String }) token!: string;
}
