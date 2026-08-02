// src/core/shared/types/smart-query.types.ts
import { FindOptionsSelect, FindOptionsRelations } from 'typeorm';

/** @internal Raw AST từ GraphQL parser */
export interface ParsedInfo {
    readonly fields: readonly string[];
    readonly relations: Readonly<Record<string, ParsedInfo>>;
}

/**
 * Kết quả build từ GraphQL fragment.
 * Chỉ chứa select + relations — spread thẳng vào FindOneOptions / FindManyOptions.
 *
 * ForeignKeyMap đã bị loại bỏ — FK được tự động inject bởi sanitize()
 * trong BaseRepository dựa trên @JoinColumn metadata của TypeORM.
 */
export interface GqlSelectOptions<T extends object = object> {
    select?: FindOptionsSelect<T>;
    relations?: FindOptionsRelations<T>;
    /** @internal */
    readonly _gqlRaw?: ParsedInfo;
}