import 'reflect-metadata';
import { METADATA_KEYS } from '@/core/shared/types/common.types';
import { rbacService } from '@/core/application/auth/RBAC.service';
import { ERoleScrope, ERole } from '@/core/shared/enums/account.enum';
import { ForbiddenException } from '@/core/domain/exceptions/appException';
import { INTERNAL_SCOPES } from '@/core/shared/constants/roleBundles';
import { MerchantRestController } from '@/modules/merchant/infrastructure/http/controllers/merchant.controller';
import { CustomerRestController } from '@/modules/customer/infrastructure/http/controllers/customer.controller';

/**
 * Regression test cho fix Critical (Phase 4 Task 9 security review) — 5 method CRUD chuẩn của
 * `BaseRestController` trước là bare `@Authorized()` ("chỉ cần đăng nhập, bất kỳ scope nào"), sau
 * khi thêm scope CUSTOMER (Task 8) sẽ vô tình mở nhiều endpoint REST cho khách công khai đã đăng
 * ký. Test đọc metadata TRỰC TIẾP trên `.prototype` của 2 class REST THẬT (`MerchantRestController`,
 * `CustomerRestController`) — KHÔNG cần `new` (constructor cần `BaseService` thật, đọc metadata
 * decorator không đụng runtime instance nào) — để tránh lỗi "test giả" đã xảy ra ở phiên bản đầu
 * (dựng lại 1 class mock riêng, không chạm code production nào, review phát hiện tự revert fix
 * thật vẫn PASS 7/7).
 *
 * `MerchantRestController.getAll`/`getById` OVERRIDE base nhưng KHÔNG tự khai `@Authorized()`
 * riêng (đọc file thật: `merchant.controller.ts:25-36`, chỉ có `@Get()`/`@Cache()`) — đúng kịch
 * bản thật gây ra lỗ hổng: metadata phải kế thừa từ `BaseRestController` qua prototype chain.
 * `CustomerRestController` KHÔNG override `getAll`/`getById` — kế thừa trực tiếp, trường hợp đơn
 * giản hơn, dùng để đối chứng.
 */
describe('BaseRestController — CUSTOMER scope KHÔNG được authorize qua REST CRUD chuẩn (test gắn thẳng vào class production)', () => {
    it('MerchantRestController.getAll (override, KHÔNG có @Authorized riêng) kế thừa đúng INTERNAL_SCOPES từ BaseRestController', () => {
        const roles = Reflect.getMetadata(METADATA_KEYS.ROLES, MerchantRestController.prototype, 'getAll');
        expect(roles).toEqual(INTERNAL_SCOPES);
    });

    it('MerchantRestController.getById (override, KHÔNG có @Authorized riêng) kế thừa đúng INTERNAL_SCOPES', () => {
        const roles = Reflect.getMetadata(METADATA_KEYS.ROLES, MerchantRestController.prototype, 'getById');
        expect(roles).toEqual(INTERNAL_SCOPES);
    });

    it('CustomerRestController.getAll (kế thừa trực tiếp, không override) có đúng INTERNAL_SCOPES', () => {
        const roles = Reflect.getMetadata(METADATA_KEYS.ROLES, CustomerRestController.prototype, 'getAll');
        expect(roles).toEqual(INTERNAL_SCOPES);
    });

    it('rbacService.authorizeRoles CHẶN account scope CUSTOMER với ROLES thật đọc từ MerchantRestController.getAll', () => {
        const roles = Reflect.getMetadata(METADATA_KEYS.ROLES, MerchantRestController.prototype, 'getAll');
        const customerAccount = { id: 'c1', username: 'a@b.com', roleScope: ERoleScrope.CUSTOMER, roles: [] };
        expect(() => rbacService.authorizeRoles(customerAccount as any, roles)).toThrow(ForbiddenException);
    });

    it.each([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])(
        'rbacService.authorizeRoles CHO QUA scope %s với ROLES thật đọc từ MerchantRestController.getAll (giữ đúng hành vi TRƯỚC KHI có scope CUSTOMER)',
        (scope) => {
            const roles = Reflect.getMetadata(METADATA_KEYS.ROLES, MerchantRestController.prototype, 'getAll');
            const account = { id: 'x1', username: 'x', roleScope: scope, roles: [ERole.SUPER_ADMIN] };
            expect(() => rbacService.authorizeRoles(account as any, roles)).not.toThrow();
        },
    );

    it('required=[] (hành vi bare @Authorized() cũ) vẫn cho qua MỌI scope kể cả CUSTOMER — xác nhận đây chính là lỗ hổng đã vá, không phải hành vi mặc định sai', () => {
        const customerAccount = { id: 'c1', username: 'a@b.com', roleScope: ERoleScrope.CUSTOMER, roles: [] };
        expect(() => rbacService.authorizeRoles(customerAccount as any, [])).not.toThrow();
    });
});
