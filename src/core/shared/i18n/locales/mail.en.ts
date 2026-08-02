import type { viMail } from './mail.vi';

export const enMail: typeof viMail = {
    smtpTest: {
        subject: 'SMTP configuration test email',
        heading: 'SMTP configuration is working!',
        body: 'This is a test email from configuration <strong>{configName}</strong> ({smtpHost}:{smtpPort}) — brand <strong>{brandName}</strong>.',
        hint: 'If you received this email, the configuration is ready to send password-reset emails to users.',
    },
    invitation: {
        subject: 'Invitation to join the system',
        body: "You've been invited to join <strong>{brandName}</strong>.",
        cta: 'Accept invitation',
        hint: "If you weren't expecting this invitation, you can ignore this email.",
    },
    accountAdded: {
        subjectAdded: 'You were added to {orgName}',
        subjectInvited: 'Invitation to join {orgName}',
        actionAdded: "You've just been added as staff of <strong>{orgName}</strong>.",
        actionInvited: "You've just been invited as staff of <strong>{orgName}</strong>.",
        hintAdded: 'Sign in with your existing account to get started.',
        hintInvited: 'Sign in with your existing account, then go to "Invitations" to accept.',
        cta: 'Sign in',
    },
};
