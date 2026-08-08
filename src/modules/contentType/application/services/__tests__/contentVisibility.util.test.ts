import { resolveEnforcedVisibilityRules } from '../contentVisibility.util';
import { ERole } from '@/core/shared/enums/account.enum';
import { ContentVisibilityRuleType } from '@/modules/contentType/application/dto/contentVisibilityRule.dto';

const HIGH_BUDGET_RULE: ContentVisibilityRuleType = {
    field: 'budget',
    operator: '$gte',
    value: 1_000_000_000,
    allowedRoles: [ERole.ADMIN, ERole.SUPER_ADMIN],
};

describe('resolveEnforcedVisibilityRules', () => {
    it('enforces a rule against an anonymous visitor (no roles)', () => {
        expect(resolveEnforcedVisibilityRules([HIGH_BUDGET_RULE], [])).toEqual([HIGH_BUDGET_RULE]);
    });

    it('enforces a rule against a viewer whose roles do not intersect allowedRoles', () => {
        expect(resolveEnforcedVisibilityRules([HIGH_BUDGET_RULE], [ERole.TENANT_STAFF])).toEqual([HIGH_BUDGET_RULE]);
    });

    it('does NOT enforce a rule against a viewer whose role is in allowedRoles', () => {
        expect(resolveEnforcedVisibilityRules([HIGH_BUDGET_RULE], [ERole.ADMIN])).toEqual([]);
    });

    it('treats a rule with no allowedRoles at all as hiding from everyone, including staff', () => {
        const rule: ContentVisibilityRuleType = { ...HIGH_BUDGET_RULE, allowedRoles: undefined };
        expect(resolveEnforcedVisibilityRules([rule], [ERole.SUPER_ADMIN])).toEqual([rule]);
    });

    it('handles multiple independent rules, enforcing only the ones the viewer fails', () => {
        const secretRule: ContentVisibilityRuleType = { field: 'internalOnly', operator: '$eq', value: true, allowedRoles: [ERole.SUPER_ADMIN] };
        const result = resolveEnforcedVisibilityRules([HIGH_BUDGET_RULE, secretRule], [ERole.ADMIN]);
        expect(result).toEqual([secretRule]);
    });

    it('returns an empty array for an empty rule list', () => {
        expect(resolveEnforcedVisibilityRules([], [ERole.ADMIN])).toEqual([]);
    });
});
