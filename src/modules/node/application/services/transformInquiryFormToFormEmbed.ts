// Close-out batch — InquiryForm's migration is a pure in-place field reshape (unlike
// MediaHero/LogoGrid/FeaturedEntry's subtree-creation transforms), since the destination is
// FormEmbedNode: a single self-contained node, not a composition of several primitives. The old
// content (heading/subtitle/serviceOptions/submitLabel/successMessage) is DISCARDED here — that
// configuration must already live on the real Form entity the given `formId` points to (a
// manual pre-step, not something this function or its caller script can do — see the plan's
// design doc for why Form creation is a human content-modeling decision).
export function buildInquiryFormReshape(formId: string): { type: string; props: Record<string, any> } {
    return { type: 'form-embed', props: { formId } };
}
