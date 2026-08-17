import { transformNodeProps } from '../migrateGroup2DataSourceToRepeat';

describe('transformNodeProps (Canvas Editor v2, Task 18)', () => {
    it('migrates FeaturedEntry: dataSource.query.contentTypeId + genericFilters -> repeat, fieldMapping -> slots', () => {
        const props = {
            content: { eyebrow: 'News' },
            dataSource: { mode: 'dynamic', query: { contentTypeId: 'ct-1', limit: 1 }, genericFilters: [{ field: 'category', operator: '$eq', valueSource: 'static', staticValue: 'blog' }] },
            fieldMapping: { image: 'img', category: 'cat', heading: 'title', description: 'desc' },
        };
        const result = transformNodeProps('featured-entry', props);
        expect(result.repeat).toEqual({ source: 'own', mode: 'dynamic', cardinality: 'one', contentTypeKey: 'ct-1', filter: props.dataSource.genericFilters, limit: 1 });
        expect(result.props.slots).toEqual({ imageField: 'img', categoryField: 'cat', headingField: 'title', descriptionField: 'desc' });
        expect(result.props.dataSource).toBeUndefined();
        expect(result.props.fieldMapping).toBeUndefined();
        expect(result.props.content).toEqual({ eyebrow: 'News' }); // untouched
    });

    it('migrates ProjectShowcase the same shape, cardinality:many', () => {
        const props = {
            dataSource: { mode: 'dynamic', query: { contentTypeId: 'ct-2', limit: 8 } },
            fieldMapping: { heading: 'title', image: 'img', description: 'desc', client: 'client', year: 'year', category: 'category' },
        };
        const result = transformNodeProps('project-showcase', props);
        expect(result.repeat).toEqual({ source: 'own', mode: 'dynamic', cardinality: 'many', contentTypeKey: 'ct-2', filter: undefined, limit: 8 });
        expect(result.props.slots).toEqual({ headingField: 'title', imageField: 'img', descriptionField: 'desc', clientField: 'client', yearField: 'year', categoryField: 'category' });
    });

    it('migrates LogoGrid the same shape with name/logo slots', () => {
        const props = { dataSource: { mode: 'dynamic', query: { contentTypeId: 'ct-3' } }, fieldMapping: { name: 'partnerName', logo: 'partnerLogo' } };
        const result = transformNodeProps('logo-grid', props);
        expect(result.repeat.contentTypeKey).toBe('ct-3');
        expect(result.props.slots).toEqual({ nameField: 'partnerName', logoField: 'partnerLogo' });
    });

    it('migrates MixedFeed: dataSource.sources -> repeat.sources verbatim (already the same shape)', () => {
        const sources = [{ contentTypeId: 'ct-1', fieldMapping: { heading: 'h' } }];
        const props = { dataSource: { sources, limit: 6 }, layoutPreset: 'grid-4' };
        const result = transformNodeProps('mixed-feed', props);
        expect(result.repeat).toEqual({ source: 'mixed', sources, limit: 6 });
        expect(result.props.dataSource).toBeUndefined();
        expect(result.props.layoutPreset).toBe('grid-4'); // untouched
    });

    it('handles a missing fieldMapping (empty slots object, not a throw)', () => {
        const result = transformNodeProps('featured-entry', { dataSource: { query: { contentTypeId: 'ct-1' } } });
        expect(result.props.slots).toEqual({});
    });

    it('handles an empty sources array for MixedFeed', () => {
        const result = transformNodeProps('mixed-feed', { dataSource: { sources: [] } });
        expect(result.repeat.sources).toEqual([]);
    });

    it('is a no-op for a node with no legacy dataSource at all', () => {
        const props = { content: { heading: 'x' } };
        const result = transformNodeProps('featured-entry', props);
        expect(result.repeat).toBeUndefined();
        expect(result.props).toEqual(props);
    });

    it('is a no-op for a node type outside the 4 Group 2 types', () => {
        const props = { content: { heading: 'x' } };
        expect(transformNodeProps('media-hero', props)).toEqual({ props, repeat: undefined });
    });
});
