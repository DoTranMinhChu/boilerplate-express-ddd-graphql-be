
import { BaseService } from '@/core/application/services/base.service';
import { MediaSetEntity } from '../../domain/entities/mediaSet.entity';
import { MediaSetRepository } from '../../infrastructure/persistence/mediaSet.repository';
import { AppDataSource } from '@/config/database.config';
import { MediaEntity } from '@/modules/media/domain/entities/media.entity';
import { In, FindOneOptions } from 'typeorm';
import { CreateMediaSetInput, UpdateMediaSetInput } from '../dto/mediaSet.dto';
import { GqlSelectOptions } from '@/core/shared/types/graphql/types';

export class MediaSetService extends BaseService<MediaSetEntity> {
    constructor(private readonly mediaSetRepository = new MediaSetRepository()) {
        super(mediaSetRepository, 'MediaSet');
    }


    private get mediaRepo() {
        return AppDataSource.getRepository(MediaEntity);
    }

    /**
     * Set each media's `index` to its position in `mediaIds`, in a single statement
     * instead of one UPDATE per media (was N sequential round trips per save — visible
     * latency on media sets with dozens of images).
     */
    private async bulkUpdateMediaIndex(mediaIds: string[]): Promise<void> {
        if (!mediaIds.length) return;
        const caseSql = mediaIds.map((_, i) => `WHEN $${i * 2 + 2} THEN $${i * 2 + 3}`).join(' ');
        const params: any[] = [];
        mediaIds.forEach((id, index) => params.push(id, index));
        await this.mediaRepo.query(
            `UPDATE "media" SET "index" = CASE "id" ${caseSql} ELSE "index" END WHERE "id" = ANY($1)`,
            [mediaIds, ...params],
        );
    }

    /**
     * Tạo MediaSet, sau đó gán setId cho tất cả mediaIds được truyền vào.
     */
    async createWithMedias(
        data: CreateMediaSetInput,
        fieldOptions?: GqlSelectOptions<MediaSetEntity>,
    ): Promise<MediaSetEntity> {
        // 1. Tạo set trước
        const set = await this.create({ content: data.content ?? '' });

        // 2. Gán setId cho từng media nếu có
        if (data.mediaIds?.length) {
            await this.mediaRepo.update(
                { id: In(data.mediaIds) },
                { setId: set.id, index: -1 }, // index sẽ được FE set qua updateMedia nếu cần
            );

            // Cập nhật index theo thứ tự FE gửi
            await this.bulkUpdateMediaIndex(data.mediaIds);
        }

        // 3. Reload để lấy medias đã gán
        return this.findOneByCondition({ where: { id: set.id }, ...fieldOptions }) as Promise<MediaSetEntity>;
    }

    /**
     * Update MediaSet: replace toàn bộ danh sách media.
     * - Media cũ (không còn trong list mới) → setId = null
     * - Media mới (trong list mới, chưa có setId) → setId = set.id
     */
    async updateWithMedias(
        options: FindOneOptions<MediaSetEntity>,
        data: UpdateMediaSetInput,
        fieldOptions?: GqlSelectOptions<MediaSetEntity>,
    ): Promise<MediaSetEntity> {
        // 1. Update content nếu có
        const set = await this.updateByCondition(options, { content: data.content });
        const setId = (set as any).id as string;

        if (data.mediaIds !== undefined) {
            // 2. Unlink media cũ không còn trong list mới
            const unlinkQb = this.mediaRepo
                .createQueryBuilder()
                .update(MediaEntity)
                .set({ setId: null as any, index: -1 });

            if (data.mediaIds.length) {
                unlinkQb.where('setId = :setId AND id NOT IN (:...ids)', { setId, ids: data.mediaIds });
            } else {
                unlinkQb.where('setId = :setId', { setId });
            }

            await unlinkQb.execute();

            // 3. Gán setId + index cho media mới (2 bulk statements instead of N per-row updates)
            await this.mediaRepo.update({ id: In(data.mediaIds) }, { setId });
            await this.bulkUpdateMediaIndex(data.mediaIds);
        }

        return this.findOneByCondition({ where: { id: setId }, ...fieldOptions }) as Promise<MediaSetEntity>;
    }
}
