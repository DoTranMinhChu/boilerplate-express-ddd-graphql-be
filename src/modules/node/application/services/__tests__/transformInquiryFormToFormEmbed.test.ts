import { buildInquiryFormReshape } from '../transformInquiryFormToFormEmbed';

describe('buildInquiryFormReshape', () => {
    it('converts to a form-embed node pointing at the given Form id, discarding the old content shape entirely', () => {
        const result = buildInquiryFormReshape('form-abc-123');
        expect(result).toEqual({ type: 'form-embed', props: { formId: 'form-abc-123' } });
    });
});
