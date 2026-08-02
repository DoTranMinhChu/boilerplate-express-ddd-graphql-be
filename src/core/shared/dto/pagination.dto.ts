import { ObjectType, Field, InputType, GQL_METADATA } from "../decorators/graphQL.decorators";
import { GraphQLMixed } from "../graphql/scalars";

@ObjectType('PageInfo')
export class PageInfo {



    @Field() startCursor?: string;
    @Field() endCursor?: string;
    @Field() hasNextPage!: boolean;
    @Field() hasPreviousPage!: boolean;
    @Field() totalCount!: number;
    @Field() totalPage!: number;
    @Field() limit!: number;
}

/**
 * Hàm tạo Type Paginated động cho GraphQL
 */
export function PaginatedResponse<T>(classRef: any) {
    // 1. Lấy tên từ Metadata @ObjectType (ví dụ: 'Tenant')
    // Nếu không tìm thấy Metadata, mặc định quay về dùng tên Class
    const gqlName = Reflect.getMetadata(GQL_METADATA.OBJECT_TYPE, classRef) || classRef.name;

    // 2. Tạo tên mới (ví dụ: 'PaginatedTenant')
    const paginatedName = `Paginated${gqlName}`;
    const EdgedName = `${gqlName}Edge`;

    @ObjectType(EdgedName)
    abstract class Edge {
        @Field({ type: classRef })
        node!: T;

        @Field({ type: String })
        cursor!: string;
    }



    @ObjectType(paginatedName)
    abstract class PaginatedType {

        @Field({ type: [Edge] })
        edges!: Edge[];

        @Field({ type: PageInfo })
        pageInfo!: PageInfo;
    }

    return PaginatedType;
}

/**
 * Args chuẩn cho Query getAll
 */
@InputType('PaginationArgs')
export class GQLPaginationArgs {
    @Field({ type: GraphQLMixed, nullable: true })
    filter?: any;

    @Field({ nullable: true })
    search?: string;

    @Field({ type: [String], nullable: true })
    searchFields?: string[];

    @Field({ nullable: true })
    after?: string;
    @Field({ nullable: true })
    before?: string


    @Field({ nullable: true })
    limit?: number;

    @Field({ type: GraphQLMixed, nullable: true })
    sort?: any;

    @Field({ nullable: true })
    page?: number;

}