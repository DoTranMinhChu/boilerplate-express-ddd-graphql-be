// src/modules/form/application/services/formSubmission.service.ts
import { FormSubmissionEntity } from '../../domain/entities/formSubmission.entity';
import { FormSubmissionRepository } from '../../infrastructure/persistence/formSubmission.repository';
import { FormRepository } from '../../infrastructure/persistence/form.repository';
import { BaseService } from '@/core/application/services/base.service';
import { NotFoundException } from '@/core/domain/exceptions/appException';
import { validateFieldData } from '@/core/shared/utils/fieldDataValidation.util';
import { eventBus } from '@/core/infrastructure/events/eventBus';

export class FormSubmissionService extends BaseService<FormSubmissionEntity> {
    constructor(
        private readonly formSubmissionRepository = new FormSubmissionRepository(),
        private readonly formRepository = new FormRepository(),
    ) {
        super(formSubmissionRepository, 'FormSubmission');
    }

    async validateAndCreate(formId: string, data: Record<string, any>): Promise<FormSubmissionEntity> {
        const form = await this.formRepository.findById(formId);
        if (!form) throw new NotFoundException('Không tìm thấy form.');
        validateFieldData(form.fields, data);
        const submission = await this.create({ formId, data });
        // Task 3 (thông báo email) đăng ký listener 'form.submitted' ở ĐÚNG điểm này -- Phase 6
        // (webhook) sẽ thêm listener thứ 2 vào cùng điểm, không sửa lại luồng tạo submission.
        eventBus.publishAsync('form.submitted', { formId, submissionId: submission.id, data });
        return submission;
    }
}
