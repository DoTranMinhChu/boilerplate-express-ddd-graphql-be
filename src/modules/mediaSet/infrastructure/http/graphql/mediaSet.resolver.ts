import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLCurrentUser, GQLQuery, Mutation, Resolver, Query, FieldResolver, Parent, Context } from "@/core/shared/decorators/graphQL.decorators";
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole } from "@/core/shared/enums/account.enum";
import { MediaSetService } from "@/modules/mediaSet/application/services/mediaSet.service";
import { MediaSetEntity } from "@/modules/mediaSet/domain/entities/mediaSet.entity";
import { GQLPaginationArgs, PaginatedResponse } from "@/core/shared/dto/pagination.dto";
import { CreateMediaSetInput, UpdateMediaSetInput } from "@/modules/mediaSet/application/dto/mediaSet.dto";
import { GqlSelectOptions } from "@/core/shared/types/graphql/types";
import { FindOneOptions } from "typeorm";
import { MediaEntity } from "@/modules/media/domain/entities/media.entity";
import { IGraphQLContext } from "@/core/infrastructure/http/middleware/auth.middleware";
const MediaSetPagination = PaginatedResponse(MediaSetEntity)

@Resolver(MediaSetEntity)
export class MediaSetResolver extends BaseGraphQLResolver<MediaSetEntity> {
  constructor(private readonly mediaSetService = new MediaSetService()) {
    super(mediaSetService, 'MediaSet');
  }

  @Query('getOneMediaSet', { returnType: MediaSetEntity })
  @GQLAuthorized(Object.values(ERole))
  async getOneMediaSet(
    @Args('id', { isRequire: true }) id: string,
    @GQLQuery() fieldOptions: GqlSelectOptions<MediaSetEntity>,
  ) {
    const options: FindOneOptions<MediaSetEntity> = { where: { id }, ...fieldOptions }
    return await this.mediaSetService.findOneByCondition(options);
  }

  @Query('getAllMediaSet', { returnType: MediaSetPagination })
  @GQLAuthorized(Object.values(ERole))
  async getAllMediaSet(
    @Args('input', { type: GQLPaginationArgs }) input: GQLPaginationArgs,
    @GQLQuery() fieldOptions: GqlSelectOptions<MediaSetEntity>,
  ) {
    return await this.mediaSetService.findAllPagination(input, fieldOptions);
  }


  @Mutation('createMediaSet', { returnType: MediaSetEntity })
  @GQLAuthorized(Object.values(ERole))
  async createMediaSet(
    @Args('data', { type: CreateMediaSetInput, isRequire: true }) data: CreateMediaSetInput,
    @GQLCurrentUser() account: IAccount,
    @GQLQuery() fieldOptions: GqlSelectOptions<MediaSetEntity>,
  ) {
    return await this.mediaSetService.createWithMedias(data, fieldOptions);
  }

  @Mutation('updateMediaSet', { returnType: MediaSetEntity })
  @GQLAuthorized(Object.values(ERole))
  async updateMediaSet(
    @Args('id', { isRequire: true }) id: string,
    @Args('data', { type: UpdateMediaSetInput, isRequire: true }) data: UpdateMediaSetInput,
    @GQLCurrentUser() account: IAccount,
    @GQLQuery() fieldOptions: GqlSelectOptions<MediaSetEntity>,
  ) {
    const options: FindOneOptions<MediaSetEntity> = { where: { id } };
    return await this.mediaSetService.updateWithMedias(options, data, fieldOptions);
  }

  @Mutation('deleteMediaSet', { returnType: Object })
  @GQLAuthorized(Object.values(ERole))
  async deleteMediaSet(@Args('id', { isRequire: true }) id: string, @GQLCurrentUser() account: IAccount) {
    const options: FindOneOptions<MediaSetEntity> = { where: { id } }
    return await this.mediaSetService.softDeleteByCondition(options);
  }




}

export default MediaSetResolver;
