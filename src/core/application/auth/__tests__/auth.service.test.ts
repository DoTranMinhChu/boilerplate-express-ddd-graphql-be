// src/core/application/auth/__tests__/auth.service.test.ts

import { authService, isCustomerPayload } from '@/core/application/auth/auth.service';
import { ERoleScrope } from '@/core/shared/enums/account.enum';

describe('authService.extractAccount — customer payload', () => {
    it('isCustomerPayload trả true khi roleScope=CUSTOMER', () => {
        const payload = { roleScope: ERoleScrope.CUSTOMER, customerId: 'c1', username: 'a@b.com' } as any;
        expect(isCustomerPayload(payload)).toBe(true);
    });

    it('extractAccount map đúng customerId -> id, roles rỗng', () => {
        const payload = { roleScope: ERoleScrope.CUSTOMER, customerId: 'c1', username: 'a@b.com' } as any;
        const account = authService.extractAccount(payload);
        expect(account).toEqual({ id: 'c1', customerId: 'c1', username: 'a@b.com', roleScope: ERoleScrope.CUSTOMER, roles: [] });
    });
});
