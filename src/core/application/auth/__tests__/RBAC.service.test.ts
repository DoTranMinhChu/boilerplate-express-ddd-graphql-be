// src/core/application/auth/__tests__/RBAC.service.test.ts
//
// Task 9 security addendum (Phase 4, mục 3) — trước khi CUSTOMER JWT tồn tại (Task 9's
// registerCustomer/loginCustomer), bare `@GQLAuthorized()` (required=[]) chấp nhận "bất kỳ scope
// nào đang đăng nhập". 13 resolver site (getAllCustomer/getOneCustomer/getAllMerchant/... — xem
// p4-task-9-security-addendum.md) đã được vá sang
// `@GQLAuthorized([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])`
// để loại CUSTOMER (khách tự đăng ký, KHÔNG phải tài khoản nội bộ) khỏi tập được chấp nhận, đồng
// thời GIỮ NGUYÊN hành vi cũ cho 4 scope nội bộ. Test này xác nhận đúng hành vi ở tầng
// RBACService.authorizeRoles (hàm trung tâm được gọi bởi @GQLAuthorized) — không cần dựng cả
// resolver/GraphQL layer.
import { rbacService } from '../RBAC.service';
import { ForbiddenException } from '@/core/domain/exceptions/appException';
import { ERole, ERoleScrope } from '@/core/shared/enums/account.enum';
import { IAccount } from '@/core/shared/types/common.types';

const SCOPE_FIX = [ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT];

function makeAccount(roleScope: ERoleScrope): IAccount {
    return { id: 'acc-1', username: 'x', roleScope, roles: [] } as IAccount;
}

describe('RBACService.authorizeRoles — fix bare @GQLAuthorized() sau khi CUSTOMER scope tồn tại', () => {
    it('throw ForbiddenException khi account CUSTOMER gọi endpoint đã vá bằng danh sách 4 scope nội bộ', () => {
        const account = makeAccount(ERoleScrope.CUSTOMER);
        expect(() => rbacService.authorizeRoles(account, SCOPE_FIX)).toThrow(ForbiddenException);
    });

    it.each([ERoleScrope.ADMIN, ERoleScrope.MERCHANT, ERoleScrope.AGENCY, ERoleScrope.TENANT])(
        'KHÔNG throw khi account scope %s (1 trong 4 scope nội bộ cũ) gọi endpoint đã vá — giữ nguyên behavior cũ',
        (scope) => {
            const account = makeAccount(scope);
            expect(() => rbacService.authorizeRoles(account, SCOPE_FIX)).not.toThrow();
        },
    );

    it('bare @GQLAuthorized() (required=[]) vẫn cho qua BẤT KỲ scope nào — hành vi gốc không đổi ở những site KHÔNG được liệt trong addendum', () => {
        const account = makeAccount(ERoleScrope.CUSTOMER);
        expect(() => rbacService.authorizeRoles(account, [])).not.toThrow();
    });
});

// ── Regression: fix `isPureScopeArray` (RBAC.service.ts) KHÔNG được phá vỡ site role-specific đã
// có từ trước — vd getOneAdmin dùng @GQLAuthorized([ERole.SUPER_ADMIN, ERole.ADMIN]). Vì
// ERole.ADMIN và ERoleScrope.ADMIN cùng string 'ADMIN', mảng [SUPER_ADMIN, ADMIN] KHÔNG được coi
// là "pure scope" (SUPER_ADMIN không phải giá trị ERoleScrope hợp lệ nào) → phải tiếp tục đi vào
// nhánh check role cụ thể như trước khi có fix này.
describe('RBACService.authorizeRoles — không phá vỡ site role-specific đã có (vd [SUPER_ADMIN, ADMIN])', () => {
    const REQUIRE_ADMIN_ROLE = [ERole.SUPER_ADMIN, ERole.ADMIN];

    it('cho qua account scope ADMIN có role ADMIN trong roles[]', () => {
        const account = { id: 'acc-1', username: 'x', roleScope: ERoleScrope.ADMIN, roles: [ERole.ADMIN] } as IAccount;
        expect(() => rbacService.authorizeRoles(account, REQUIRE_ADMIN_ROLE)).not.toThrow();
    });

    it('throw ForbiddenException khi account scope ADMIN nhưng roles[] KHÔNG chứa ADMIN/SUPER_ADMIN', () => {
        const account = { id: 'acc-1', username: 'x', roleScope: ERoleScrope.ADMIN, roles: [] } as IAccount;
        expect(() => rbacService.authorizeRoles(account, REQUIRE_ADMIN_ROLE)).toThrow(ForbiddenException);
    });

    it('throw ForbiddenException khi account scope MERCHANT gọi endpoint yêu cầu role ADMIN cụ thể (scope sai context)', () => {
        const account = { id: 'acc-1', username: 'x', roleScope: ERoleScrope.MERCHANT, roles: [] } as IAccount;
        expect(() => rbacService.authorizeRoles(account, REQUIRE_ADMIN_ROLE)).toThrow(ForbiddenException);
    });
});
