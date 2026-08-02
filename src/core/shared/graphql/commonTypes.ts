/**
 * Các ObjectType/InputType dùng chung trong GraphQL schema.
 */
import { ObjectType, Field, InputType } from '../decorators/graphQL.decorators';
import { Int } from './scalars';

// ── Key-Value Pair ─────────────────────────────────────────────────────────────

/** Output: cặp key-value trả về từ API */
@ObjectType('KeyValuePair')
export class KeyValuePairType {
    @Field()
    key!: string;

    @Field()
    value!: string;
}

/** Input: cặp key-value gửi lên API */
@InputType('KeyValuePairInput')
export class KeyValuePairInput {
    @Field()
    key!: string;

    @Field()
    value!: string;
}

// ── Utility functions ─────────────────────────────────────────────────────────

/** Chuyển Record<string,any> → KeyValuePairType[] (value được stringify nếu không phải string) */
export function toKVArray(record?: Record<string, any> | null): KeyValuePairType[] {
    if (!record) return [];
    return Object.entries(record).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
}

/** Chuyển KeyValuePairType[] → Record<string, string> */
export function fromKVArray(pairs?: KeyValuePairType[] | null): Record<string, string> {
    if (!pairs?.length) return {};
    return pairs.reduce<Record<string, string>>((acc, p) => {
        acc[p.key] = p.value;
        return acc;
    }, {});
}

/** Lấy giá trị một key từ KV array */
export function getKV(pairs?: KeyValuePairType[] | null, key?: string): string | undefined {
    if (!pairs || !key) return undefined;
    return pairs.find(p => p.key === key)?.value;
}

/** Lấy giá trị số từ KV array */
export function getKVNumber(pairs?: KeyValuePairType[] | null, key?: string): number | undefined {
    const v = getKV(pairs, key);
    if (v === undefined) return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
}

/** Lấy giá trị JSON-parsed từ KV array (dùng cho array/object lưu dưới dạng JSON string) */
export function getKVParsed<T = any>(pairs?: KeyValuePairType[] | null, key?: string): T | undefined {
    const v = getKV(pairs, key);
    if (v === undefined) return undefined;
    try { return JSON.parse(v) as T; } catch { return v as unknown as T; }
}

/** Tạo KV array từ các key-value riêng lẻ, bỏ qua các cặp undefined/null */
export function buildKVArray(entries: Array<[string, string | number | boolean | null | undefined]>): KeyValuePairType[] {
    return entries
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([key, value]) => ({ key, value: String(value) }));
}

// ── Job log entry ─────────────────────────────────────────────────────────────

@ObjectType('JobLogEntry')
export class JobLogEntryType {
    @Field()
    ts!: string;

    @Field()
    level!: string; // 'info' | 'warn' | 'error'

    @Field()
    msg!: string;
}

// ── Pipeline step (Jenkins-style stage) ───────────────────────────────────────

@ObjectType('PipelineStep')
export class PipelineStepType {
    @Field()
    key!: string;

    @Field()
    name!: string;

    @Field()
    status!: string; // 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

    @Field({ nullable: true })
    startedAt?: string;

    @Field({ nullable: true })
    completedAt?: string;

    @Field({ nullable: true, type: Int })
    durationMs?: number;

    @Field({ isList: true, type: () => JobLogEntryType })
    logs!: JobLogEntryType[];

    @Field({ nullable: true })
    errorMessage?: string;
}

// ── Env variable definition ───────────────────────────────────────────────────

@ObjectType('EnvVariableDefinition')
export class EnvVariableDefinitionType {
    @Field()
    key!: string;

    @Field({ nullable: true })
    defaultValue?: string;

    @Field({ nullable: true })
    description?: string;

    @Field()
    isSecret!: boolean;

    @Field()
    isRequired!: boolean;
}

@InputType('EnvVariableDefinitionInput')
export class EnvVariableDefinitionInput {
    @Field()
    key!: string;

    @Field({ nullable: true })
    defaultValue?: string;

    @Field({ nullable: true })
    description?: string;

    @Field({ nullable: true })
    isSecret?: boolean;

    @Field({ nullable: true })
    isRequired?: boolean;
}
