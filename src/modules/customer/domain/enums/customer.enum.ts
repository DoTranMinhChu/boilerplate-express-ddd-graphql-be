import { RegisterEnum } from "@/core/shared/decorators/graphQL.decorators"

export enum ECustomerIdentifierType {
    PHONE = 'PHONE',
    EMAIL = 'EMAIL',
    FACEBOOK = "FACEBOOK",
    CUSTOM = "CUSTOM"
}
RegisterEnum(ECustomerIdentifierType, "ECustomerIdentifierType")


export enum ECustomerTraitSentiment {
    POSITIVE = 'POSITIVE',
    NEUTRAL = 'NEUTRAL',
    NEGATIVE = "NEGATIVE"
}

RegisterEnum(ECustomerTraitSentiment, "ECustomerTraitSentiment")


export enum EAuthProvider {
    PASSWORD = 'PASSWORD',
    GOOGLE = 'GOOGLE',
}

RegisterEnum(EAuthProvider, "EAuthProvider")
