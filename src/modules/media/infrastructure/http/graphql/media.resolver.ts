import { BaseGraphQLResolver } from "@/core/infrastructure/http/baseGraphql.resolver";
import { GQLAuthorized, Args, GQLCurrentUser, Mutation, Resolver, Query, FieldResolver, Parent } from "@/core/shared/decorators/graphQL.decorators";
import { IAccount, CACHE_TTL } from '@/core/shared/types/common.types';
import { ERole } from "@/core/shared/enums/account.enum";
import { MediaService } from "@/modules/media/application/services/media.service";
import { MediaEntity } from "@/modules/media/domain/entities/media.entity";
import { GQLPaginationArgs, PaginatedResponse } from "@/core/shared/dto/pagination.dto";

import { PresignedUrlResponse, GeneratePresignedUrlInput, CreateMediaInput, UpdateMediaInput } from "@/modules/media/application/dto/media.dto";
import { MediaManager } from "@/modules/media/application/services/mediaManager.service";
import { StringUtil } from "@/core/shared/utils/string.util";
import { ENV_CONFIG } from "@/config/env.config";
const MediaPagination = PaginatedResponse(MediaEntity)

@Resolver(MediaEntity)
export class MediaResolver extends BaseGraphQLResolver<MediaEntity> {
  constructor(private readonly mediaService = new MediaService(), private mediaManagerSrv = new MediaManager) {
    super(mediaService, 'Media');
  }
  @GQLAuthorized(Object.values(ERole)) // Yêu cầu đăng nhập mới được upload
  @Mutation('createMedia', { returnType: () => MediaEntity })
  async createMedia(
    @Args('input', { type: () => CreateMediaInput }) input: CreateMediaInput
  ): Promise<MediaEntity> {

    // Gọi manager để tạo Media nháp và lấy URL từ S3Service
    return this.mediaService.populateMedia(input);
  }

  @GQLAuthorized(Object.values(ERole)) // Yêu cầu đăng nhập mới được upload
  @Mutation('updateMedia', { returnType: () => MediaEntity })
  async updateMedia(
    @Args('id') id: string,
    @Args('input', { type: () => UpdateMediaInput }) input: UpdateMediaInput
  ): Promise<MediaEntity> {

    // Gọi manager để tạo Media nháp và lấy URL từ S3Service
    return this.mediaService.updateById(id, input);
  }
  /**
      * Mutation: Lấy URL để upload ảnh lên S3
      * Client gọi cái này TRƯỚC KHI lưu Product/User/Post...
      */
  @GQLAuthorized(Object.values(ERole)) // Yêu cầu đăng nhập mới được upload
  @Mutation('generatePresignedUrl', { returnType: () => PresignedUrlResponse })
  async generatePresignedUrl(
    @Args('input', { type: () => GeneratePresignedUrlInput }) input: GeneratePresignedUrlInput
  ): Promise<PresignedUrlResponse> {

    // Gọi manager để tạo Media nháp và lấy URL từ S3Service
    const result = await this.mediaManagerSrv.createPresignedUrl({
      contentLength: input.contentLength!,
      contentType: input.contentType!,
    });

    return {
      url: result.url,
      fileId: result.id
    };
  }
  @FieldResolver({ returnType: String })
  url(@Parent() media: MediaEntity) {
    return media.fullUrl
  }
}

export default MediaResolver;
