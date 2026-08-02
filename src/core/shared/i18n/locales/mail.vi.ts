// Vietnamese strings for hardcoded email templates in core/infrastructure/mail/mail.service.ts.
// (The password-reset template itself is admin-configurable per EmailConfigEntity, not
// hardcoded, so it isn't part of this catalog — only the two fully-static templates are.)
export const viMail = {
    smtpTest: {
        subject: 'Email thử nghiệm cấu hình SMTP',
        heading: 'Cấu hình SMTP hoạt động!',
        body: 'Đây là email thử nghiệm từ cấu hình <strong>{configName}</strong> ({smtpHost}:{smtpPort}) — thương hiệu <strong>{brandName}</strong>.',
        hint: 'Nếu bạn nhận được email này, cấu hình đã sẵn sàng để gửi email đặt lại mật khẩu cho người dùng.',
    },
    invitation: {
        subject: 'Lời mời tham gia hệ thống',
        body: 'Bạn được mời tham gia hệ thống <strong>{brandName}</strong>.',
        cta: 'Chấp nhận lời mời',
        hint: 'Nếu bạn không mong đợi lời mời này, hãy bỏ qua email.',
    },
    accountAdded: {
        subjectAdded: 'Bạn đã được thêm vào {orgName}',
        subjectInvited: 'Lời mời tham gia {orgName}',
        actionAdded: 'Bạn vừa được thêm làm nhân sự của <strong>{orgName}</strong>.',
        actionInvited: 'Bạn vừa được mời làm nhân sự của <strong>{orgName}</strong>.',
        hintAdded: 'Đăng nhập bằng tài khoản hiện có để bắt đầu làm việc.',
        hintInvited: 'Đăng nhập bằng tài khoản hiện có, vào mục "Lời mời" để chấp nhận.',
        cta: 'Đăng nhập',
    },
};
