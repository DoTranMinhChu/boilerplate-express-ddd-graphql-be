export enum EDeletionMode {
    SOFT = 'SOFT',
    HARD = 'HARD',
    NONE = 'NONE',
}

export enum ECascadeAction {
    CASCADE_SOFT = 'CASCADE_SOFT',
    CASCADE_HARD = 'CASCADE_HARD',
    SET_NULL = 'SET_NULL',
    RESTRICT = 'RESTRICT',
    NO_CASCADE = 'NO_CASCADE',
}
