import { matchPathPattern } from '../slug.util';

describe('matchPathPattern', () => {
    it('extracts a single named param', () => {
        expect(matchPathPattern('/danh-muc/ao-thun', '/danh-muc/:tenDanhMuc')).toEqual({ tenDanhMuc: 'ao-thun' });
    });

    it('extracts multiple named params in different positions', () => {
        expect(matchPathPattern('/vi/danh-muc/ao-thun', '/:locale/danh-muc/:tenDanhMuc')).toEqual({ locale: 'vi', tenDanhMuc: 'ao-thun' });
    });

    it('returns null when a literal segment does not match', () => {
        expect(matchPathPattern('/khac/ao-thun', '/danh-muc/:tenDanhMuc')).toBeNull();
    });

    it('returns null when segment counts differ', () => {
        expect(matchPathPattern('/danh-muc/ao-thun/extra', '/danh-muc/:tenDanhMuc')).toBeNull();
    });

    it('matches a pattern with no params at all as a plain literal match', () => {
        expect(matchPathPattern('/gioi-thieu', '/gioi-thieu')).toEqual({});
    });

    it('treats root path consistently', () => {
        expect(matchPathPattern('/', '/')).toEqual({});
    });
});
