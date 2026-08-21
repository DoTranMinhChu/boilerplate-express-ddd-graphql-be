import { buildMediaHeroSubtree, buildLogoGridSubtree, buildFeaturedEntrySubtree } from '../transformCloseOutBatchToPrimitives';

describe('buildMediaHeroSubtree', () => {
    it('converts the root to a Frame with an image background + breathe animation, and creates a caption Text + arrow Button child', () => {
        const result = buildMediaHeroSubtree({ content: { image: 'hero.jpg', caption: 'Xin chào', arrowHref: '#about' } });
        expect(result.updatedRoot.type).toBe('frame');
        expect(result.updatedRoot.style).toEqual(expect.objectContaining({
            background: { type: 'image', value: 'hero.jpg', animate: 'breathe' },
        }));
        expect(result.children).toHaveLength(2);
        expect(result.children[0]).toEqual(expect.objectContaining({ type: 'text', props: expect.objectContaining({ text: 'Xin chào' }) }));
        expect(result.children[1]).toEqual(expect.objectContaining({ type: 'button', props: expect.objectContaining({ href: '#about' }) }));
    });

    it('defaults arrowHref to "#about" when unset, matching the original component\'s own default', () => {
        const result = buildMediaHeroSubtree({ content: { image: 'hero.jpg' } });
        // No caption in this fixture, so per the next test's own requirement the Button is the
        // ONLY child (index 0, not a hardcoded index 1 that assumes a caption is always present).
        const button = result.children.find((c: { type: string }) => c.type === 'button');
        expect(button?.props?.href).toBe('#about');
    });

    it('omits the caption Text child entirely when there is no caption (matching the original\'s conditional render)', () => {
        const result = buildMediaHeroSubtree({ content: { image: 'hero.jpg' } });
        expect(result.children.filter((c: { type: string }) => c.type === 'text')).toHaveLength(0);
    });
});

describe('buildLogoGridSubtree', () => {
    it('converts the root to a Frame with rail Text children + a repeat-bound grid Frame', () => {
        const result = buildLogoGridSubtree(
            { content: { railTitle: 'Khách hàng', railText: '<p>Đối tác</p>' } },
            { source: 'own', contentTypeKey: 'ct-1' },
            { nameField: 'partnerName', logoField: 'partnerLogo' },
        );
        expect(result.updatedRoot.type).toBe('frame');
        expect(result.children[0]).toEqual(expect.objectContaining({ type: 'text', props: expect.objectContaining({ text: 'Khách hàng' }) }));
        expect(result.children[1]).toEqual(expect.objectContaining({ type: 'text', props: expect.objectContaining({ text: '<p>Đối tác</p>' }) }));
        const gridFrame = result.children[2];
        expect(gridFrame.type).toBe('frame');
        expect(gridFrame.layout).toEqual(expect.objectContaining({ display: 'grid' }));
    });

    it('the grid Frame itself carries NO repeat (it is a static display:grid container) — repeat lives on the nested card instead', () => {
        const originalRepeat = { source: 'own', contentTypeKey: 'ct-1', limit: 20 };
        const result = buildLogoGridSubtree({ content: {} }, originalRepeat, { nameField: 'n', logoField: 'l' });
        expect(result.children[2].repeat).toBeUndefined();
        expect(result.children[2].children![0].repeat).toEqual(originalRepeat);
    });

    it('explicitly clears the root\'s own repeat to null — the old bespoke node self-resolved its repeat on its own row, the new root must not', () => {
        const result = buildLogoGridSubtree({ content: {} }, { source: 'own', contentTypeKey: 'ct-1' }, {});
        expect(result.updatedRoot.repeat).toBeNull();
    });

    it('the grid Frame has a nested card Frame (carrying the repeat) with Image (bound to logoField) + Text (bound to nameField) children', () => {
        const result = buildLogoGridSubtree(
            { content: {} },
            { source: 'own', contentTypeKey: 'ct-1' },
            { nameField: 'partnerName', logoField: 'partnerLogo' },
        );
        const gridFrame = result.children[2];
        expect(gridFrame.children).toHaveLength(1);
        const card = gridFrame.children![0];
        expect(card.type).toBe('frame');
        expect(card.children).toEqual([
            expect.objectContaining({ type: 'image', dataBinding: { mode: 'boundField', field: 'partnerLogo' } }),
            expect.objectContaining({ type: 'text', dataBinding: { mode: 'boundField', field: 'partnerName' } }),
        ]);
    });
});

describe('buildFeaturedEntrySubtree', () => {
    it('converts the root to a repeat cardinality:one Frame with image/eyebrow/heading/description/button children', () => {
        const result = buildFeaturedEntrySubtree(
            { content: { eyebrow: 'Nổi bật' } },
            { source: 'own', contentTypeKey: 'ct-1', cardinality: 'one', linkToDetail: true },
            { imageField: 'img', categoryField: 'cat', headingField: 'head', descriptionField: 'desc' },
        );
        expect(result.updatedRoot.type).toBe('frame');
        expect(result.children.map((c: { type: string }) => c.type)).toEqual(['image', 'text', 'text', 'text', 'button']);
        expect(result.children[0].dataBinding).toEqual({ mode: 'boundField', field: 'img' });
        expect(result.children[1].props?.text).toBe('Nổi bật'); // eyebrow is static
        expect(result.children[2].dataBinding).toEqual({ mode: 'boundField', field: 'head' });
        expect(result.children[3].dataBinding).toEqual({ mode: 'boundField', field: 'desc' });
    });

    it('does NOT write repeat into updatedRoot.props — repeat is the row\'s own top-level column, left untouched by the runner script when converting FeaturedEntry\'s existing repeat-bearing node in place', () => {
        const originalRepeat = { source: 'own', contentTypeKey: 'ct-1', cardinality: 'one' as const, linkToDetail: true };
        const result = buildFeaturedEntrySubtree({ content: {} }, originalRepeat, {});
        expect(result.updatedRoot.props?.repeat).toBeUndefined();
    });
});
