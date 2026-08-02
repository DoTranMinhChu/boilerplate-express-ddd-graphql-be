
import { MediaEntity } from '../../domain/entities/media.entity';
import { MediaRepository } from '../../infrastructure/persistence/media.repository';

import { FindOneOptions, In, IsNull, LessThan } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { InternalServerException, NotFoundException } from '@/core/domain/exceptions/appException';
import { MediaManager } from './mediaManager.service';
import { BaseService } from '@/core/application/services/base.service';
import { S3Service, EMediaType } from '@/core/application/services/s3.service';

export class MediaService extends BaseService<MediaEntity> {
    constructor(private readonly mediaRepository = new MediaRepository(), private readonly s3Service = new S3Service()) {



        super(mediaRepository, 'Media');
    }

    /**
        * Bước 1: Client yêu cầu upload
        * Tạo một record Media tạm thời (chưa có ownerId)
        */
    async createUploadUrl(contentType: string) {
        // const fileId = uuidv7();
        // const key = `uploads/${fileId}`; // Path trên S3

        // const presignedUrl = await this.mediaManagerSrv.getPresignedUrl({
        //     fileId,
        //     type: this.s3Service.getFileType(contentType)
        // }
        // );

        // await this.mediaRepository.create({
        //     fileId,
        //     url: key,
        //     fileName: 'pending_upload',
        //     fileSize: 0,
        //     // ownerId đang để NULL
        // });

        // return { url: presignedUrl, fileId };
    }
    async populateMedia(

        data: {
            fileId: string,
            url: string;
            fileSize: number;
            fileName: string;
            type: EMediaType;
        },
    ) {
        const media = await this.findOneByCondition({ where: { fileId: data.fileId } });
        if (!media) throw new NotFoundException();
        if (!data.url) throw new InternalServerException();

        const parsedUrl = new URL(data.url);

        const url = decodeURIComponent(parsedUrl.pathname);

        const item = await this.updateByCondition(
            {
                where: { id: media.id }
            },
            {
                ...data,
                url,
            },
        );
        return item;
    }
    /**
     * Bước 2: Sau khi Entity chính (ví dụ Post) được save
     * Phải gọi hàm này để "xác nhận" quyền sở hữu cho ảnh
     */
    async bindMediaToOwner(fileIds: string[], ownerId: string, ownerType: string) {
        await this.mediaRepository.updateOneByCondition(
            { where: { fileId: In(fileIds) } },
            { ownerId, ownerType }
        );
    }

    /**
     * Tải 1 ảnh từ URL ngoài (vd: avatar từ nhà cung cấp SSO) về và reupload vào storage của mình,
     * tạo MediaEntity thật (isExternal:false) — không lưu trực tiếp URL ngoài vì có
     * thể hết hạn/đổi domain. Timeout + validate content-type để tránh fetch bừa bãi
     * 1 URL do client cung cấp (chống lạm dụng SSRF-like).
     */
    async importFromUrl(
        url: string,
        options: { ownerId?: string; ownerType?: string } = {},
    ): Promise<MediaEntity> {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
            throw new Error(`Không tải được ảnh từ URL (status ${res.status})`);
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) {
            throw new Error(`URL không phải là ảnh (content-type: ${contentType})`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        const fileId = uuidv7();
        const { key } = await this.s3Service.uploadBuffer({ fileId, contentType, buffer });
        const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';

        return this.mediaRepository.create({
            fileId,
            url: key,
            fileSize: buffer.length,
            fileName: `${fileId}.${ext}`,
            type: this.s3Service.getFileType(contentType),
            isExternal: false,
            ownerId: options.ownerId,
            ownerType: options.ownerType,
        } as any);
    }

    /**
     * CRON JOB: Chạy hằng tuần để xóa ảnh mồ côi
     * Xóa những Media record có ownerId là NULL và đã tạo quá 24h
     */
    async cleanOrphanedMedias() {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const orphaned = await this.mediaRepository.findByCondition({
            where: {
                ownerId: IsNull(),
                createdAt: LessThan(oneDayAgo)
            }
        });

        for (const media of orphaned) {
            try {
                // 1. Xóa trên S3
                await this.s3Service.deleteObject(media);
                // 2. Xóa trong DB
                await this.mediaRepository.deleteById(media.id);
            } catch (error) {
                console.error(`Failed to cleanup media ${media.id}`, error);
            }
        }
    }
}
