

import { uuidv7 } from 'uuidv7';

import { MediaService } from './media.service';
import { EMediaType, S3Service } from '@/core/application/services/s3.service';
import { BadRequestException } from '@/core/domain/exceptions/appException';
import { EErrorCode } from '@/core/shared/enums/errorCode.enum';
import { IsNull, LessThanOrEqual } from 'typeorm';

export class MediaManager {


  constructor(private readonly s3 = new S3Service(), private readonly mediaSrv = new MediaService()) {

  }

  async deleteAndRemoveFromStorage(id: string, fileId: string, type: string) {
    if (!this.s3) {
      throw new Error('No S3 definition exists!');
    }
    await this.mediaSrv.manager().transaction(async (em) => {
      await this.s3.deleteObject({ fileId, type });
      await this.mediaSrv.deleteById(id);
    });
  }

  async cleanUpOrphaned({
    timeframe = 'one_week_ago',
  }: {
    // cron job will run before_yesterday, only use now for testing/dev
    timeframe: 'one_week_ago' | 'now';
  }) {
    if (!this.s3) {
      throw new Error('No S3 definition exists!');
    }

    const date = new Date();
    switch (timeframe) {
      case 'one_week_ago': {
        date.setDate(date.getDate() - 7);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        break;
      }
      case 'now': {
        break;
      }
      default: {
        throw new BadRequestException(
          'invalid timeframe, allowed values: one_week_ago | now',
          EErrorCode.VALIDATION_FAILED,
        );
      }
    }
    if (timeframe === 'one_week_ago') {
      date.setDate(date.getDate() - 7);
      date.setHours(0);
      date.setMinutes(0);
      date.setSeconds(0);
    }
    const medias = await this.mediaSrv.findByCondition(
      { where: { ownerId: IsNull(), setId: IsNull(), createdAt: LessThanOrEqual(date) } },

    );
    let success = 0;
    for (const media of medias) {
      try {
        await this.deleteAndRemoveFromStorage(
          media.id,
          media.fileId,
          media.type,
        );
        success += 1;
      } catch (err) {
        console.error(err, `Có lỗi xảy ra khi xoá media ${media.id}`);
      }
    }
    const message = `Đã xoá xong (${success}/${medias.length}) media không dùng!`;
    console.info(message);
    return message;
  }
  async createPresignedUrl({
    contentType,
    contentLength,
  }: {
    contentType: string;
    contentLength: number;
  }) {
    if (!this.s3) {
      throw new Error('No S3 definition exists!');
    }
    const id = uuidv7();
    const { presignedUrl, key } = await this.s3.createPresignedUrlWithClient({
      fileId: id,
      contentType,
      contentLength,
    });
    await this.mediaSrv.create({
      fileId: id,
      fileName: '',
      fileSize: 0,
      isExternal: false,
      url: key,
      type: EMediaType.FILE,
    });
    return {
      url: presignedUrl,
      id,
    };
  }
}
