import { createClient, RedisClientType } from 'redis';
import { Logger } from '@/core/shared/utils/Logger';
import { ECacheStrategy } from '@/core/shared/types/common.types';

export class CacheManager {
    private static instance: CacheManager;
    private redisClient: RedisClientType | null = null;
    private memoryCache: Map<string, { value: any; expiresAt: number }> = new Map();
    private logger = Logger.getInstance();
    private strategy: ECacheStrategy = ECacheStrategy.MEMORY;
    private isRedisReady: boolean = false;

    // Biến kiểm soát việc log lỗi
    private hasLoggedError: boolean = false;

    private constructor() { }

    static getInstance(): CacheManager {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager();
        }
        return CacheManager.instance;
    }

    async connect(redisUrl?: string): Promise<void> {
        const url = redisUrl || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;

        try {
            this.redisClient = createClient({
                url,
                socket: {
                    connectTimeout: 5000,
                    reconnectStrategy: (retries) => {
                        if (retries <= 10) {
                            // 10 lần đầu thử lại sau mỗi 2 giây
                            return 2000;
                        }

                        // Sau 10 lần thì cứ 10 phút mới thử lại một lần (10 * 60 * 1000 ms)
                        if (retries === 11) {
                            this.logger.info('Redis reconnection: Max retries reached. Will retry every 10 minutes...');
                        }
                        return 10 * 60 * 1000;
                    }
                }
            }) as RedisClientType;

            this.redisClient.on('error', (err) => {
                // CHỐT CHẶN LOG: Chỉ log một lần duy nhất khi có lỗi
                if (!this.hasLoggedError) {
                    this.logger.warn(`Redis Connection Issue: ${err.message}. Using Memory Cache.`);
                    this.hasLoggedError = true; // Đánh dấu đã log, các lần lỗi sau (khi retry) sẽ im lặng
                }
                this.isRedisReady = false;
                this.strategy = ECacheStrategy.MEMORY;
            });

            this.redisClient.on('ready', () => {
                this.logger.info('Redis connected successfully.');
                this.isRedisReady = true;
                this.strategy = ECacheStrategy.REDIS;
                this.hasLoggedError = false; // Reset flag khi kết nối lại thành công
            });

            this.redisClient.connect().catch(() => {
                // Error đã được xử lý trong event 'error'
            });

        } catch (error) {
            this.logger.error('Failed to setup Redis client:', error);
        }
    }

    // --- CÁC HÀM GET/SET/DELETE GIỮ NGUYÊN NHƯ TRƯỚC ---
    async get<T>(key: string): Promise<T | null> {
        try {
            if (this.strategy === ECacheStrategy.REDIS && this.isRedisReady && this.redisClient) {
                const value = await this.redisClient.get(key);
                return value ? JSON.parse(value) : null;
            }
            const cached = this.memoryCache.get(key);
            if (cached && Date.now() < cached.expiresAt) return cached.value;
            return null;
        } catch (error) {
            this.logger.warn(`CacheManager.get failed for key "${key}": ${(error as Error).message}`);
            return null;
        }
    }

    async set(key: string, value: any, ttl: number = 300): Promise<void> {
        try {
            if (this.isRedisReady && this.redisClient) {
                await this.redisClient.setEx(key, ttl, JSON.stringify(value));
            } else {
                // Only populate the in-memory fallback when Redis isn't the active backend —
                // otherwise every cache write also grows this process-local Map for no benefit.
                this.memoryCache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
            }
        } catch (error) {
            this.logger.warn(`CacheManager.set failed for key "${key}": ${(error as Error).message}`);
        }
    }
    async delete(key: string): Promise<void> {
        try {
            if (this.isRedisReady && this.redisClient) {
                await this.redisClient.del(key);
            }
            this.memoryCache.delete(key);
        } catch (error) {
            this.logger.warn(`CacheManager.delete failed for key "${key}": ${(error as Error).message}`);
        }
    }
    async deletePattern(pattern: string): Promise<void> {
        try {
            if (this.isRedisReady && this.redisClient) {
                const keys = await this.redisClient.keys(pattern);
                if (keys.length > 0) await this.redisClient.del(keys);
            }
            const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
            this.memoryCache.forEach((_, key) => { if (regex.test(key)) this.memoryCache.delete(key); });
        } catch (error) {
            this.logger.warn(`CacheManager.deletePattern failed for pattern "${pattern}": ${(error as Error).message}`);
        }
    }

    /** Liveness check for /health/ready — true only if Redis is configured AND reachable. */
    async ping(): Promise<boolean> {
        if (!this.redisClient || !this.isRedisReady) return false;
        try {
            await this.redisClient.ping();
            return true;
        } catch {
            return false;
        }
    }

    startPeriodicCleanup(intervalMs: number = 60000): void {
        setInterval(() => {
            const now = Date.now();
            this.memoryCache.forEach((cached, key) => {
                if (now >= cached.expiresAt) this.memoryCache.delete(key);
            });
        }, intervalMs);
    }

    async disconnect(): Promise<void> {
        if (this.redisClient) {
            await this.redisClient.quit();
            this.isRedisReady = false;
        }
    }
}

export const cacheManager = CacheManager.getInstance();