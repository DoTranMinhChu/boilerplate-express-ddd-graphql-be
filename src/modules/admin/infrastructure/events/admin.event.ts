
import { eventBus } from "@/core/infrastructure/events/eventBus";
import { IEventPayload } from "@/core/shared/types/common.types";
import { Logger } from "@/core/shared/utils/Logger";

const logger = Logger.getInstance();

/**
 * Admin Event Handlers
 * Subscribe tới các events liên quan đến Admin
 */

// Handler khi admin được tạo
eventBus.subscribe('admin.created', async (event: IEventPayload) => {
    logger.info('Admin created event received', event.payload);

    // TODO: Gửi email welcome
    // TODO: Tạo audit log
    // TODO: Notify other services
});

// Handler khi admin login
eventBus.subscribe('admin.logged_in', async (event: IEventPayload) => {
    logger.info('Admin logged in', event.payload);

    // TODO: Ghi log security
    // TODO: Track login history
});

// Handler khi admin bị xóa
eventBus.subscribe('admin.deleted', async (event: IEventPayload) => {
    logger.info('Admin deleted', event.payload);

    // TODO: Clean up related data
    // TODO: Notify related services
});

// Handler khi admin updated
eventBus.subscribe('admin.updated', async (event: IEventPayload) => {
    logger.info('Admin updated', event.payload);

    // TODO: Clear cache
    // TODO: Sync with other systems
});

logger.info('Admin event handlers registered');