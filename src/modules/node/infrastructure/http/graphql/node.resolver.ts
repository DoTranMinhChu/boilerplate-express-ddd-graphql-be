import { BaseGraphQLResolver } from '@/core/infrastructure/http/baseGraphql.resolver';
import { GQLAuthorized, Args, Resolver, Mutation, Query, GQLPublic } from '@/core/shared/decorators/graphQL.decorators';
import { GQLPermission } from '@/core/shared/decorators/graphQLPermission.decorator';
import { ERole } from '@/core/shared/enums/account.enum';
import { EPermission } from '@/modules/permission/enums/permission.enum';
import { NodeEntity } from '@/modules/node/domain/entities/node.entity';
import { NodeService } from '@/modules/node/application/services/node.service';
import { CreateNodeInput, UpdateNodeInput, ReorderNodeItemInput, MoveNodeInput } from '@/modules/node/application/dto/node.dto';

const STAFF_ROLES = Object.values(ERole);

@Resolver(NodeEntity)
export class NodeResolver extends BaseGraphQLResolver<NodeEntity> {
    private nodeService: NodeService;

    constructor() {
        const service = new NodeService();
        super(service, 'Node');
        this.nodeService = service;
    }

    @Query('getNodesByPage', { returnType: [NodeEntity] })
    @GQLPublic()
    async getNodesByPage(@Args('pageId') pageId: string) {
        return this.nodeService.findByPage(pageId);
    }

    @Mutation('createNode', { returnType: NodeEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.NODE_MANAGE, onForbidden: 'throw' })
    async createNode(@Args('data', { type: CreateNodeInput }) data: CreateNodeInput) {
        return this.nodeService.createNode(data as any);
    }

    @Mutation('updateNode', { returnType: NodeEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.NODE_MANAGE, onForbidden: 'throw', checkArg: 'id' })
    async updateNode(
        @Args('id') id: string,
        @Args('data', { type: UpdateNodeInput }) data: UpdateNodeInput,
    ) {
        return this.nodeService.updateById(id, data as any);
    }

    @Mutation('deleteNode', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.NODE_MANAGE, onForbidden: 'throw', checkArg: 'id' })
    async deleteNode(@Args('id') id: string) {
        await this.nodeService.deleteSubtree(id);
        return true;
    }

    @Mutation('moveNode', { returnType: NodeEntity })
    @GQLAuthorized(STAFF_ROLES)
    // Fix Critical (Task 7 review): moveNode chỉ nhận arg `data` (không có arg `id`
    // riêng) — `checkArg: 'id'` đọc args['id'] luôn undefined, khiến ownership-check bị
    // bỏ qua âm thầm (fail-open). Dùng dot-path 'data.id' (handler đã sửa dùng _.get).
    @GQLPermission({ permission: EPermission.NODE_MANAGE, onForbidden: 'throw', checkArg: 'data.id' })
    async moveNode(@Args('data', { type: MoveNodeInput }) data: MoveNodeInput) {
        return this.nodeService.moveNode(data.id, data.newParentId, data.newOrder);
    }

    @Mutation('duplicateNode', { returnType: NodeEntity })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.NODE_MANAGE, onForbidden: 'throw', checkArg: 'id' })
    async duplicateNode(@Args('id') id: string) {
        return this.nodeService.duplicateSubtree(id);
    }

    @Mutation('reorderNodes', { returnType: Boolean })
    @GQLAuthorized(STAFF_ROLES)
    @GQLPermission({ permission: EPermission.NODE_MANAGE, onForbidden: 'throw' })
    async reorderNodes(@Args('items', { type: [ReorderNodeItemInput] }) items: ReorderNodeItemInput[]) {
        await this.nodeService.reorder(items);
        return true;
    }
}

export default NodeResolver;
