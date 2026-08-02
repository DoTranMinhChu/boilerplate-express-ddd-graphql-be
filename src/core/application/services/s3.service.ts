import { ENV_CONFIG } from '@/config/env.config';
import { RegisterEnum } from '@/core/shared/decorators/graphQL.decorators';

import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export enum EMediaType {
    IMAGE = 'IMAGE',
    VIDEO = 'VIDEO',
    FILE = 'FILE',
    AUDIO = "AUDIO"
}
RegisterEnum(EMediaType, "EMediaType")
const MAX_MEDIA_CONTENT_LENGTH: { [K in EMediaType]: number } = {
    // In MB
    [EMediaType.IMAGE]: 10 * 1024 * 1024,
    [EMediaType.VIDEO]: 100 * 1024 * 1024,
    [EMediaType.AUDIO]: 20 * 1024 * 1024,
    [EMediaType.FILE]: 50 * 1024 * 1024,
};
export class S3Service {
    private region: string;
    private bucket: string;
    private folder: string;
    private client: S3Client;

    constructor({ url } = { url: ENV_CONFIG.S3.URL }) {
        const s3Url = new URL(url);
        this.region = s3Url.searchParams.get('region') || 'ap-southeast-1';
        this.bucket = s3Url.hostname;
        this.folder = decodeURIComponent(s3Url.pathname.slice(1));
        const endpoint = s3Url.searchParams.get('endpoint');
        this.client = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: decodeURIComponent(s3Url.username),
                secretAccessKey: decodeURIComponent(s3Url.password),
            },
            ...(endpoint && {
                endpoint: decodeURIComponent(endpoint),
                forcePathStyle: true,
            }),
        });
    }

    getFileType(contentType: string): EMediaType {
        if (contentType.match('image.*')) return EMediaType.IMAGE;
        if (contentType.match('video.*')) return EMediaType.VIDEO;
        if (contentType.match('audio.*')) return EMediaType.AUDIO;

        return EMediaType.FILE;
    }

    createPresignedUrlWithClient = async ({
        fileId,
        contentType,
        contentLength,
    }: {
        fileId: string;
        contentType: string;
        contentLength: number;
    }) => {
        const mediaType = this.getFileType(contentType);
        if (contentLength > MAX_MEDIA_CONTENT_LENGTH[mediaType]) {
            throw new Error(
                `Max ${mediaType} size: ${MAX_MEDIA_CONTENT_LENGTH[mediaType]}`,
            );
        }

        const key = `${this.folder}/${mediaType?.toLowerCase()}/${fileId}`;

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            ContentLength: contentLength,
            CacheControl: 'max-age=31536000, public',
        });
        return {
            presignedUrl: await getSignedUrl(this.client, command, {
                expiresIn: 3600,
            }),
            key,
        };
    };

    /**
     * Upload buffer trực tiếp lên S3/MinIO server-side (không presign) — dùng khi
     * server đã có sẵn bytes (vd: tải ảnh từ URL ngoài về để reupload vào storage của mình).
     */
    uploadBuffer = async ({
        fileId,
        contentType,
        buffer,
    }: {
        fileId: string;
        contentType: string;
        buffer: Buffer;
    }): Promise<{ key: string }> => {
        const mediaType = this.getFileType(contentType);
        if (buffer.length > MAX_MEDIA_CONTENT_LENGTH[mediaType]) {
            throw new Error(`Max ${mediaType} size: ${MAX_MEDIA_CONTENT_LENGTH[mediaType]}`);
        }

        const key = `${this.folder}/${mediaType?.toLowerCase()}/${fileId}`;

        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            ContentLength: buffer.length,
            CacheControl: 'max-age=31536000, public',
        }));

        return { key };
    };

    deleteObject = async ({ fileId, type }: { fileId: string; type: string }) => {
        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: `${this.folder}/${type?.toLowerCase()}/${fileId}`,
            }),
        );
    };


    /**
     * Tải object trực tiếp từ S3/MinIO bằng key (path trong bucket).
     * Nhanh hơn fetch CDN vì đi qua internal network, không qua HTTP proxy/CDN.
     * key là phần đường dẫn sau bucket name, ví dụ: "uploads/image/abc.jpg"
     */
    async downloadByKey(key: string): Promise<Buffer | null> {
        try {
            const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
            const { Body } = await this.client.send(command);
            if (!Body) return null;
            // Body là Readable trong Node.js runtime
            return await this._streamToBuffer(Body as Readable);
        } catch {
            return null;
        }
    }

    private _streamToBuffer(stream: Readable): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    }

    /**
     * CDN base URL (bao gồm bucket name theo path-style MinIO).
     * Dùng để extract S3 key từ fullUrl của MediaEntity.
     */
    get cdnBase(): string {
        return ENV_CONFIG.S3.CDN_DOMAIN.replace(/\/$/, '');
    }

    getPresignedUrl = async ({
        fileId,
        type,
    }: {
        fileId: string;
        type: EMediaType;
    }) => {
        // Step 1: Generate a presigned URL for accessing the file
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: `${this.folder}/${type?.toLowerCase()}/${fileId}`,
        });

        const presignedUrl = await getSignedUrl(this.client, command, {
            expiresIn: 3600,
        });

        return presignedUrl;
    };
}
