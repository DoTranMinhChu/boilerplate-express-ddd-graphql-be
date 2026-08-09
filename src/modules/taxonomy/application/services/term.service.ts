import { TermEntity } from '../../domain/entities/term.entity';
import { TermRepository } from '../../infrastructure/persistence/term.repository';
import { BaseService } from '@/core/application/services/base.service';
import { ConflictException, NotFoundException } from '@/core/domain/exceptions/appException';
import { slugify } from '@/core/shared/utils/slug.util';
import { DeepPartial } from 'typeorm';

export class TermService extends BaseService<TermEntity> {
    constructor(private readonly termRepository = new TermRepository()) {
        super(termRepository, 'Term');
    }

    private async assertSlugAvailable(taxonomyId: string, slug: string, excludeId?: string): Promise<void> {
        const existing = await this.termRepository.findOneByCondition({ where: { taxonomyId, slug } });
        if (existing && existing.id !== excludeId) {
            throw new ConflictException(`Slug "${slug}" đã tồn tại trong taxonomy này.`);
        }
    }

    /** Chặn parentId trỏ vào chính nó, hoặc tạo vòng lặp cha/con (A -> B -> A) — đi ngược chuỗi cha của
     * `candidateParentId` tới gốc, nếu gặp lại `termId` thì là vòng lặp. Logic thuần, không đụng DB thêm
     * ngoài các lần findById cần thiết để đi ngược chuỗi — giới hạn 50 bước đề phòng dữ liệu hỏng sẵn có
     * gây vòng lặp vô hạn (không nên xảy ra nếu hàm này luôn được gọi trước khi lưu, nhưng an toàn thêm).
     */
    private async assertNoCycle(termId: string | undefined, candidateParentId: string | undefined): Promise<void> {
        if (!candidateParentId) return;
        if (candidateParentId === termId) {
            throw new ConflictException('Term không thể là cha của chính nó.');
        }
        let current: string | undefined = candidateParentId;
        for (let i = 0; i < 50 && current; i++) {
            if (current === termId) {
                throw new ConflictException('Không thể gán cha — sẽ tạo vòng lặp cha/con.');
            }
            const parent = await this.termRepository.findById(current);
            current = parent?.parentId;
        }
    }

    async createTerm(input: DeepPartial<TermEntity> & { slug?: string }): Promise<TermEntity> {
        const slug = slugify(input.slug || (input.label as string));
        await this.assertSlugAvailable(input.taxonomyId as string, slug);
        await this.assertNoCycle(undefined, input.parentId as string | undefined);
        return this.create({ ...input, slug });
    }

    async updateTerm(id: string, input: DeepPartial<TermEntity> & { slug?: string }): Promise<TermEntity> {
        const current = await this.termRepository.findById(id);
        if (!current) throw new NotFoundException('Không tìm thấy term.');

        let slug = current.slug;
        if (input.slug && input.slug !== current.slug) {
            slug = slugify(input.slug);
            await this.assertSlugAvailable(current.taxonomyId, slug, id);
        }
        if (input.parentId !== undefined) {
            await this.assertNoCycle(id, input.parentId as string | undefined);
        }
        return this.updateById(id, { ...input, slug });
    }
}
