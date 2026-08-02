import 'reflect-metadata';
import { Get, Post, Put } from '@/core/shared/decorators/restAPI.decorators';
import { METADATA_KEYS } from '@/core/shared/types/common.types';

/**
 * Regression test cho bug route-metadata bleed (P4.2).
 *
 * Trước fix: `createRouteDecorator` dùng `Reflect.getMetadata` (kế thừa theo
 * prototype chain) rồi push thẳng vào mảng trả về → mutate mảng dùng chung của
 * lớp cha → route custom của 1 subclass rò rỉ sang các sibling subclass khác.
 *
 * Test này dựng 2 sibling subclass, mỗi lớp thêm 1 route riêng, và khẳng định:
 *  - Lớp base KHÔNG bị chèn thêm route của subclass nào.
 *  - Mỗi subclass thấy route CRUD kế thừa từ base + route riêng của CHÍNH nó,
 *    nhưng KHÔNG thấy route của sibling.
 */
describe('BaseRestController route metadata inheritance (no sibling bleed)', () => {
    const routeKeys = (cls: any): string[] => {
        const routes: any[] = Reflect.getMetadata(METADATA_KEYS.REST_ROUTE, cls) || [];
        return routes.map((r) => `${r.method} ${r.path}`).sort();
    };

    class BaseCtrl {
        @Get()
        getAll() {}

        @Post()
        create() {}

        @Put('/:id')
        updateOne() {}
    }

    class ChildA extends BaseCtrl {
        @Post('/a-only')
        customA() {}
    }

    class ChildB extends BaseCtrl {
        @Get('/b-only')
        customB() {}
    }

    it('keeps the base class array free of any subclass routes', () => {
        expect(routeKeys(BaseCtrl)).toEqual(['GET ', 'POST ', 'PUT /:id']);
    });

    it('gives each subclass its own route array (distinct references)', () => {
        const a: any[] = Reflect.getMetadata(METADATA_KEYS.REST_ROUTE, ChildA);
        const b: any[] = Reflect.getMetadata(METADATA_KEYS.REST_ROUTE, ChildB);
        const base: any[] = Reflect.getMetadata(METADATA_KEYS.REST_ROUTE, BaseCtrl);
        expect(a).not.toBe(b);
        expect(a).not.toBe(base);
        expect(b).not.toBe(base);
    });

    it('ChildA sees base CRUD + its own route, but NOT ChildB routes', () => {
        const keys = routeKeys(ChildA);
        expect(keys).toEqual(expect.arrayContaining(['GET ', 'POST ', 'PUT /:id', 'POST /a-only']));
        expect(keys).not.toContain('GET /b-only');
    });

    it('ChildB sees base CRUD + its own route, but NOT ChildA routes', () => {
        const keys = routeKeys(ChildB);
        expect(keys).toEqual(expect.arrayContaining(['GET ', 'POST ', 'PUT /:id', 'GET /b-only']));
        expect(keys).not.toContain('POST /a-only');
    });
});
