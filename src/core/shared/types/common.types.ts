import { Request } from 'express';
import { EAccountSource, ERole, ERoleScrope } from '../enums/account.enum';

// ==================== ENUMS ====================

export enum ESort {
  ASC = 'ASC',
  ASC_NULLS_FIRST = 'ASC_NULLS_FIRST',
  ASC_NULLS_LAST = 'ASC_NULLS_LAST',
  DESC = 'DESC',
  DESC_NULLS_FIRST = 'DESC_NULLS_FIRST',
  DESC_NULLS_LAST = 'DESC_NULLS_LAST',
}

export enum ECacheStrategy {
  REDIS = 'redis',
  MEMORY = 'memory',
  NONE = 'none'
}

export enum EHttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE'
}

// ==================== FILTER OPERATORS ====================
export enum EFilterOperator {
  EQUALS = '$eq',           // Bằng
  NOT_EQUALS = '$ne',       // Không bằng
  GREATER_THAN = '$gt',     // Lớn hơn
  GREATER_THAN_OR_EQUAL = '$gte',  // Lớn hơn hoặc bằng
  LESS_THAN = '$lt',        // Nhỏ hơn
  LESS_THAN_OR_EQUAL = '$lte',     // Nhỏ hơn hoặc bằng
  IN = '$in',               // Trong danh sách
  NOT_IN = '$nin',          // Không trong danh sách
  LIKE = '$like',           // LIKE %value%
  ILIKE = '$ilike',         // ILIKE %value% (case insensitive)
  STARTS_WITH = '$sw',      // Bắt đầu với
  ENDS_WITH = '$ew',        // Kết thúc với
  BETWEEN = '$between',     // Giữa 2 giá trị
  IS_NULL = '$null',        // IS NULL
  NOT_NULL = '$notNull',    // IS NOT NULL
}
export interface IAccount {
  id: string
  // ── Luôn có ───────────────────────────────────────────────
  merchantId?: string;      // = accountId với admin
  username: string;
  roleScope: ERoleScrope;
  roles: ERole[];     // [] khi scope = MERCHANT

  // ── Agency context (có khi roleScope = AGENCY) ────────────
  agencyAccountId?: string;
  agencyId?: string;

  // ── Tenant context (có khi roleScope = TENANT) ────────────
  tenantAccountId?: string;
  tenantId?: string;
  source?: EAccountSource;

  // ── Agency "đang thao tác với tổ chức" (Parase 2) ─────────
  // Set từ header x-acting-tenant-id khi tài khoản AGENCY tạo dữ liệu cho 1 tenant cụ thể.
  // CHỈ dùng để stamp tenantId khi create; KHÔNG ảnh hưởng scope read/update/delete.
  actingTenantId?: string;

  // ── Admin only ────────────────────────────────────────────
  accountId?: string;

}

export interface IAuthRequest extends Request {
  user?: IAccount;
  token?: string;
}

/**
 * Pagination params với filter động và search
 * 
 * VÍ DỤ:
 * {
 *   filter: {
 *     name: "John",                    // Simple equality
 *     age: { $gte: 18, $lte: 65 },    // Between 18 and 65
 *     status: { $in: ['active', 'pending'] },  // In list
 *     email: { $like: "@gmail.com" }   // Contains
 *   },
 *   search: "john",  // Search trong các fields được chỉ định
 *   searchFields: ['name', 'email', 'phone'],
 *   page: 1,
 *   limit: 10,
 *   sort: { createdAt: 'DESC', name: 'ASC' }
 * }
 */
export interface IPaginationParams {
  filter?: any;

  search?: string;

  searchFields?: string[];
  after?: string;
  before?: string
  page?: number;

  limit?: number;

  sort?: any;

}

export interface IPageInfo {
  startCursor?: string;
  endCursor?: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  totalCount: number;
  totalPage: number;
  limit: number;
}

export interface IEdge<T> {
  node: T;
  cursor: string;
}


export interface IPaginatedResult<T> {
  edges: IEdge<T>[];
  pageInfo: IPageInfo;
}

export interface IApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: any[];
}

export interface ICacheOptions {
  ttl?: number;
  key?: string;
  strategy?: ECacheStrategy;
}

export interface IEventPayload {
  eventName: string;
  payload: any;
  metadata?: {
    userId?: string;
    timestamp: Date;
    correlationId?: string;
  };
}

// ==================== DECORATORS METADATA ====================
export interface IRestApiMetadata {
  path: string;
  method: EHttpMethod;
  roles?: ERole[];
  cache?: ICacheOptions;
  rateLimit?: number;
}

export interface IGraphQLMetadata {
  type: 'Query' | 'Mutation' | 'Subscription';
  name: string;
  roles?: ERole[];
  cache?: ICacheOptions;
}

// ==================== CONSTANTS ====================
export const METADATA_KEYS = {
  REST_API: 'rest:api',
  REST_ROUTE: 'rest:route',
  GRAPHQL_RESOLVER: 'graphql:resolver',
  ROLES: 'roles',
  CACHE: 'cache',
  AUTHORIZED: 'authorized'
} as const;

export const DEFAULT_PAGINATION: IPaginationParams = {
  page: 1,
  limit: 10,
  sort: { createdAt: 'DESC' }
};

// Hard ceiling on `limit` for every paginated query — prevents a caller from
// requesting an unbounded result set (OOM / event-loop stall risk).
export const MAX_PAGINATION_LIMIT = 200;

export const CACHE_TTL = {
  SHORT: 60,        // 1 minute
  MEDIUM: 300,      // 5 minutes
  LONG: 3600,       // 1 hour
  VERY_LONG: 86400  // 24 hours
} as const;
