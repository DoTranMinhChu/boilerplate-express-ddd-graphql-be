import { RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

// ─── Entity types that get an auto-generated, prefix/sequence-based code ──────
//
// Example values only — this source base ships no domain entities that need
// a human-readable code. Add one value per entity in your own domain that
// wants an auto-generated code (e.g. an order, invoice, or document number),
// then add a matching entry to `DEFAULT_CODE_CONFIGS` in codeConfig.service.ts.
export enum ECodeEntityType {
    /** Example: ORD-2026-00001 */
    ORDER = 'ORDER',
    /** Example: INV-2026-00001 */
    INVOICE = 'INVOICE',
    /** Example: DOC-2026-00001 */
    DOCUMENT = 'DOCUMENT',
}

RegisterEnum(ECodeEntityType, 'ECodeEntityType');
