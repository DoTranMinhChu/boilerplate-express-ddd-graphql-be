import 'reflect-metadata';
import { MerchantService } from '../merchant.service';
import { UnauthorizedException, NotFoundException, ForbiddenException } from '@/core/domain/exceptions/appException';
import { authService } from '@/core/application/auth/auth.service';
import { ERoleScrope } from '@/core/shared/enums/account.enum';

// ── Fakes ─────────────────────────────────────────────────────────────────
// MerchantService takes its repositories as constructor params (with default
// `new XRepository()` values) — passing fakes directly bypasses TypeORM/the DB
// entirely, letting us test the login/switch-context flow in isolation.

function makeMerchant(overrides: Partial<any> = {}) {
    return {
        id: 'merchant-1',
        username: 'alice',
        email: 'alice@example.com',
        password: 'hashed-password',
        isActivated: true,
        ...overrides,
    };
}

describe('MerchantService.login', () => {
    it('issues a MERCHANT-scope token on valid credentials', async () => {
        const merchant = makeMerchant();
        const merchantRepository: any = {
            findOneByCondition: jest.fn().mockResolvedValue(merchant),
            updateLastLogin: jest.fn().mockResolvedValue(undefined),
        };
        jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);
        const generateTokenSpy = jest.spyOn(authService, 'generateToken').mockReturnValue('signed.jwt.token');

        const service = new MerchantService(merchantRepository, {} as any, {} as any, {} as any, {} as any, {} as any);
        const result = await service.login({ username: 'alice', password: 'correct-password' } as any);

        expect(merchantRepository.findOneByCondition).toHaveBeenCalledWith({ where: { username: 'alice' } });
        expect(merchantRepository.updateLastLogin).toHaveBeenCalledWith('merchant-1');
        expect(generateTokenSpy).toHaveBeenCalledWith(
            expect.objectContaining({ roleScope: ERoleScrope.MERCHANT, merchantId: 'merchant-1', username: 'alice' }),
        );
        expect(result.token).toBe('signed.jwt.token');
        // password must never be echoed back to the caller
        expect(result.merchant.password).toBeUndefined();

        generateTokenSpy.mockRestore();
        jest.restoreAllMocks();
    });

    it('rejects a wrong password without leaking whether the account exists', async () => {
        const merchant = makeMerchant();
        const merchantRepository: any = {
            findOneByCondition: jest.fn().mockResolvedValue(merchant),
            updateLastLogin: jest.fn(),
        };
        jest.spyOn(authService, 'comparePassword').mockResolvedValue(false);

        const service = new MerchantService(merchantRepository, {} as any, {} as any, {} as any, {} as any, {} as any);

        await expect(
            service.login({ username: 'alice', password: 'wrong-password' } as any),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(merchantRepository.updateLastLogin).not.toHaveBeenCalled();

        jest.restoreAllMocks();
    });

    it('throws NotFoundException when the username does not exist', async () => {
        const merchantRepository: any = {
            findOneByCondition: jest.fn().mockResolvedValue(null),
        };
        const service = new MerchantService(merchantRepository, {} as any, {} as any, {} as any, {} as any, {} as any);

        await expect(
            service.login({ username: 'ghost', password: 'x' } as any),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects login for a deactivated account', async () => {
        const merchant = makeMerchant({ isActivated: false });
        const merchantRepository: any = {
            findOneByCondition: jest.fn().mockResolvedValue(merchant),
        };
        const service = new MerchantService(merchantRepository, {} as any, {} as any, {} as any, {} as any, {} as any);

        await expect(
            service.login({ username: 'alice', password: 'whatever' } as any),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});

describe('MerchantService.switchToAgency (context switch)', () => {
    it('issues an AGENCY-scope token when the merchant belongs to an active agency account', async () => {
        const agency = { id: 'agency-1', code: 'AG01' };
        const agencyAccount = {
            id: 'agency-account-1',
            isActivated: true,
            roles: ['AGENCY_STAFF'],
            merchant: { username: 'alice' },
        };
        const agencyRepository: any = { findOneByCondition: jest.fn().mockResolvedValue(agency) };
        const agencyAccountRepository: any = { findOneByCondition: jest.fn().mockResolvedValue(agencyAccount) };
        const generateTokenSpy = jest.spyOn(authService, 'generateToken').mockReturnValue('agency.jwt.token');

        const service = new MerchantService(
            {} as any, agencyAccountRepository, {} as any, agencyRepository, {} as any, {} as any,
        );

        const result = await service.switchToAgency('merchant-1', { agencyCode: 'AG01' } as any);

        expect(agencyRepository.findOneByCondition).toHaveBeenCalledWith({ where: { code: 'AG01' } });
        expect(agencyAccountRepository.findOneByCondition).toHaveBeenCalledWith({
            where: { merchantId: 'merchant-1', agencyId: 'agency-1' },
        });
        expect(generateTokenSpy).toHaveBeenCalledWith(
            expect.objectContaining({ roleScope: ERoleScrope.AGENCY, agencyId: 'agency-1', merchantId: 'merchant-1' }),
        );
        expect(result.token).toBe('agency.jwt.token');

        generateTokenSpy.mockRestore();
    });

    it('rejects an unknown agency code', async () => {
        const agencyRepository: any = { findOneByCondition: jest.fn().mockResolvedValue(null) };
        const service = new MerchantService({} as any, {} as any, {} as any, agencyRepository, {} as any, {} as any);

        await expect(
            service.switchToAgency('merchant-1', { agencyCode: 'NOPE' } as any),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a merchant who is not assigned to the target agency', async () => {
        const agency = { id: 'agency-1', code: 'AG01' };
        const agencyRepository: any = { findOneByCondition: jest.fn().mockResolvedValue(agency) };
        const agencyAccountRepository: any = { findOneByCondition: jest.fn().mockResolvedValue(null) };
        const service = new MerchantService({} as any, agencyAccountRepository, {} as any, agencyRepository, {} as any, {} as any);

        await expect(
            service.switchToAgency('merchant-1', { agencyCode: 'AG01' } as any),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
