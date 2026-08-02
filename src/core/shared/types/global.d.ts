export { }; // Đảm bảo file này được coi là một module

declare global {
    // Bạn có thể thay 'any[]' bằng kiểu dữ liệu cụ thể của Resolver class nếu muốn
    var __GRAPHQL_RESOLVERS__: any[] | undefined;
    var __GQL_ENUMS__: Map<any, any> | undefined;

    type Partial<T> = {
        [P in keyof T]?: T[P];
    };
}

