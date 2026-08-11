import { eventBus } from '@/core/infrastructure/events/eventBus';
import { IEventPayload } from '@/core/shared/types/common.types';
import { Logger } from '@/core/shared/utils/Logger';
import { FormRepository } from '../persistence/form.repository';
import { EmailConfigService } from '@/modules/emailConfig/application/services/emailConfig.service';
import { mailService } from '@/core/infrastructure/mail/mail.service';

const logger = Logger.getInstance();

/**
 * Form Event Handlers
 * Subscribe tới các events liên quan đến Form (Phase 4 mục 1, GROUP A).
 */

// Handler khi có submission mới — gửi email thông báo tới notifyEmail (nếu Form có cấu hình).
// Đăng ký ở đây (module-level, chạy 1 lần lúc import — xem admin.event.ts làm khuôn) thay vì
// trong FormSubmissionService để tách rời "tạo submission" khỏi "tác dụng phụ gửi mail" — Phase 6
// (webhook) sẽ thêm 1 subscribe('form.submitted', ...) thứ 2 độc lập, không sửa lại handler này.
eventBus.subscribe('form.submitted', async (event: IEventPayload) => {
    const { formId, data } = event.payload as { formId: string; submissionId: string; data: Record<string, any> };

    const formRepository = new FormRepository();
    const form = await formRepository.findById(formId);
    if (!form?.notifyEmail) return;

    try {
        const emailConfigService = new EmailConfigService();
        // domain rỗng: submission không có origin FE gắn kèm (khác với reset-password/invitation,
        // gọi trong request HTTP có origin) -- findForDomain('') fallback về config isDefault=true
        // (xem EmailConfigRepository.findForDomain, extractHostname('') rỗng nên bỏ qua nhánh khớp domain).
        const config = await emailConfigService.findForDomain('');
        await mailService.sendFormSubmissionNotification({
            to: form.notifyEmail,
            formLabel: form.label,
            data,
            config,
        });
    } catch (error) {
        // Không rethrow: eventBus.publishAsync đã tự bắt lỗi mỗi handler, nhưng bắt riêng ở đây
        // để log rõ ngữ cảnh (formId) thay vì lỗi chung "Async error in event handler for ...".
        logger.error(`[Form] Gửi email thông báo submission thất bại cho form "${formId}":`, error);
    }
});

logger.info('Form event handlers registered');
