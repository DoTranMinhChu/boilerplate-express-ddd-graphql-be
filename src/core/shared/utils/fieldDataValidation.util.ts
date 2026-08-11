// src/core/shared/utils/fieldDataValidation.util.ts
//
// Required/minLength/maxLength/pattern áp dụng cho `data` theo `FieldDefinitionType[]` — mirror
// ContentEntryService.validateData nhưng KHÔNG áp `unique` (dùng cho dữ liệu KHÔNG có khái niệm
// "duy nhất trong 1 tập hợp bản ghi", vd 1 FormSubmission độc lập, hoặc Booking.extraData của 1
// Form phụ gắn kèm). Xuất THÀNH HÀM ĐỘC LẬP (không phải method private của 1 service) để dùng
// chung ở CẢ FormSubmissionService (Task 2) VÀ BookingResolver (Task 20, validate `extraData` khi
// `bookingSettings.bookingFormId` có gắn) — tránh 2 bản copy lệch nhau.
import { BadRequestException } from '@/core/domain/exceptions/appException';
import { FieldDefinitionType } from '@/modules/contentType/application/dto/fieldDefinition.dto';
import { EFieldType } from '@/modules/contentType/application/enums/contentType.enum';

export function validateFieldData(fields: FieldDefinitionType[], data: Record<string, any>): void {
    for (const f of fields) {
        const value = data?.[f.key];
        if (f.required && (value === undefined || value === null || value === '')) {
            throw new BadRequestException(`Field "${f.label}" (${f.key}) bắt buộc nhập.`);
        }
        if (value === undefined || value === null) continue;
        if ((f.type === EFieldType.TEXT || f.type === EFieldType.RICHTEXT) && typeof value === 'string') {
            // Fix Critical (Task 5 QA trình duyệt phát hiện): GraphQL trả `null` (KHÔNG phải
            // `undefined`) cho field Int nullable chưa set -- `f.maxLength !== undefined` là
            // `true` khi `f.maxLength === null`, rồi `value.length > null` bị JS coerce
            // `null` -> `0`, khiến MỌI giá trị không rỗng "vượt quá" giới hạn không hề tồn tại.
            // Dùng `!= null` (loose, bắt cả 2 trường hợp) thay vì `!== undefined`.
            if (f.minLength != null && value.length < f.minLength) {
                throw new BadRequestException(`Field "${f.key}" phải có ít nhất ${f.minLength} ký tự.`);
            }
            if (f.maxLength != null && value.length > f.maxLength) {
                throw new BadRequestException(`Field "${f.key}" không được vượt quá ${f.maxLength} ký tự.`);
            }
            if (f.pattern) {
                try {
                    if (!new RegExp(f.pattern).test(value)) {
                        throw new BadRequestException(`Field "${f.key}" không đúng định dạng yêu cầu.`);
                    }
                } catch (err) {
                    if (err instanceof BadRequestException) throw err;
                    // regex admin gõ sai cú pháp -> bỏ qua rule này thay vì crash cả app khi lưu dữ liệu
                }
            }
        }
    }
}
