
import { IEventPayload } from '../../shared/types/common.types';
import { Logger } from '@/core/shared/utils/Logger';

type EventHandler = (payload: IEventPayload) => Promise<void> | void;

export class EventBus {
    private static instance: EventBus;
    private handlers: Map<string, EventHandler[]> = new Map();
    private logger = Logger.getInstance();

    private constructor() { }

    static getInstance(): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }

    /**
     * Đăng ký handler cho một event
     * @param eventName Tên event (ví dụ: 'admin.created')
     * @param handler Hàm xử lý event
     */
    subscribe(eventName: string, handler: EventHandler): void {
        if (!this.handlers.has(eventName)) {
            this.handlers.set(eventName, []);
        }
        this.handlers.get(eventName)!.push(handler);
        this.logger.info(`Subscribed handler for event: ${eventName}`);
    }

    /**
     * Hủy đăng ký handler
     */
    unsubscribe(eventName: string, handler: EventHandler): void {
        const handlers = this.handlers.get(eventName);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Publish event ĐỒNG BỘ - chờ tất cả handlers xử lý xong
     */
    async publish(eventName: string, payload: any, metadata?: any): Promise<void> {
        const handlers = this.handlers.get(eventName) || [];

        if (handlers.length === 0) {
            this.logger.warn(`No handlers registered for event: ${eventName}`);
            return;
        }

        const eventPayload: IEventPayload = {
            eventName,
            payload,
            metadata: {
                ...metadata,
                timestamp: new Date(),
                correlationId: metadata?.correlationId || this.generateCorrelationId()
            }
        };

        this.logger.info(`Publishing event: ${eventName}`, { correlationId: eventPayload.metadata?.correlationId });

        // Execute all handlers sequentially
        for (const handler of handlers) {
            try {
                await handler(eventPayload);
            } catch (error) {
                this.logger.error(`Error in event handler for ${eventName}:`, error);
                // Continue executing other handlers even if one fails
            }
        }
    }

    /**
     * Publish event BẤT ĐỒNG BỘ - không chờ handlers (fire-and-forget)
     */
    publishAsync(eventName: string, payload: any, metadata?: any): void {
        const eventPayload: IEventPayload = {
            eventName,
            payload,
            metadata: {
                ...metadata,
                timestamp: new Date(),
                correlationId: metadata?.correlationId || this.generateCorrelationId()
            }
        };

        const handlers = this.handlers.get(eventName) || [];

        handlers.forEach(handler => {
            Promise.resolve(handler(eventPayload)).catch(error => {
                this.logger.error(`Async error in event handler for ${eventName}:`, error);
            });
        });
    }

    /**
     * Lấy danh sách tất cả events đã đăng ký
     */
    getRegisteredEvents(): string[] {
        return Array.from(this.handlers.keys());
    }

    /**
     * Xóa tất cả handlers
     */
    clear(): void {
        this.handlers.clear();
    }

    private generateCorrelationId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();