import 'reflect-metadata';
import { Get, Authorized } from '@/core/shared/decorators/restAPI.decorators';
import { METADATA_KEYS } from '@/core/shared/types/common.types';
import { rbacService } from '@/core/application/auth/RBAC.service';
import { ERoleScrope, ERole } from '@/core/shared/enums/account.enum';
import { ForbiddenException } from '@/core/domain/exceptions/appException';

/**
 * Regression test cho fix Critical (Phase 4 Task 9 security review) — 5 method CRUD chuẩn của
 * `BaseRestController` trước là bare `@Authorized()` ("chỉ cần đăng nhập, bất kỳ scope nào"), sau
 * khi thêm scope CUSTOMER (Task 8) sẽ vô tình mở 16 endpoint REST cho khách công khai đã đăng ký.
 *
 * Test này KHÔNG import trực tiếp `BaseRestController` (constructor cần 1 `BaseService` thật) —
 * dựng lại đúng shape metadata mà class đó khai báo (bare vs INTERNAL_SCOPES), rồi verify
 * `rbacService.authorizeRoles` xử lý đúng 2 trường hợp, khớp hành vi thật của
 * `restRouter.loader.ts:222-235` (đọc `ROLES` metadata rồi gọi `authorizeRoles`).
 */
describe('BaseRestController — CUSTOMER scope KHÔNG được authorize qua REST CRUD chuẩn', () => {
    const INTERNAL_SCOPES = [ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT];

    class FixedBaseCtrl {
        @Get()
        @Authorized(INTERNAL_SCOPES)
        getAll() { }
    }

    // Mirror đúng tình huống thật (merchant.controller.ts's getAll override) — subclass override
    // 1 method KHÔNG tự khai lại @Authorized() nào -- metadata AUTHORIZED/ROLES phải kế thừa từ
    // class cha qua prototype chain của reflect-metadata.
    class ChildOverrideNoOwnDecorator extends FixedBaseCtrl {
        getAll() { return 'overridden'; }
    }

    it('subclass override KHÔNG tự khai @Authorized() vẫn kế thừa ROLES metadata từ base (không phải bare)', () => {
        const roles = Reflect.getMetadata(METADATA_KEYS.ROLES, ChildOverrideNoOwnDecorator.prototype, 'getAll');
        expect(roles).toEqual(INTERNAL_SCOPES);
    });

    it('rbacService.authorizeRoles CHẶN account scope CUSTOMER khi required = INTERNAL_SCOPES (đúng behavior sau fix)', () => {
        const customerAccount = { id: 'c1', username: 'a@b.com', roleScope: ERoleScrope.CUSTOMER, roles: [] };
        expect(() => rbacService.authorizeRoles(customerAccount as any, INTERNAL_SCOPES)).toThrow(ForbiddenException);
    });

    it.each([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])(
        'rbacService.authorizeRoles CHO QUA scope %s (giữ đúng hành vi TRƯỚC KHI có scope CUSTOMER)',
        (scope) => {
            const account = { id: 'x1', username: 'x', roleScope: scope, roles: [ERole.SUPER_ADMIN] };
            expect(() => rbacService.authorizeRoles(account as any, INTERNAL_SCOPES)).not.toThrow();
        },
    );

    it('required=[] (bare @Authorized() cũ, KHÔNG dùng ở BaseRestController nữa) vẫn cho qua MỌI scope kể cả CUSTOMER — xác nhận đây chính là lỗ hổng đã vá, không phải hành vi mặc định sai', () => {
        const customerAccount = { id: 'c1', username: 'a@b.com', roleScope: ERoleScrope.CUSTOMER, roles: [] };
        expect(() => rbacService.authorizeRoles(customerAccount as any, [])).not.toThrow();
    });
});
