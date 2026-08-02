import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { CronExpressionParser } from 'cron-parser';
import { Logger } from '../../shared/utils/Logger';
import { CronJobEntity, EJobStatus } from './cronJob.entity';
import { ICronJobDefinition } from './cron.types';

class CronService {
    private dataSource!: DataSource;
    private repository!: Repository<CronJobEntity>;
    private isPolling = false;
    private readonly POLLING_INTERVAL = 5000; // Check DB mỗi 5 giây
    private logger = Logger.getInstance();
    private jobRegistry = new Map<string, ICronJobDefinition>();

    constructor() { }

    public init(dataSource: DataSource) {
        this.dataSource = dataSource;
        this.repository = this.dataSource.getRepository(CronJobEntity);
    }

    public registerJob(job: ICronJobDefinition) {
        if (this.jobRegistry.has(job.key)) {
            this.logger.warn(`[Cron] Duplicate job key: ${job.key}. Overwriting...`);
        }
        this.jobRegistry.set(job.key, job);
    }

    public async start() {
        if (!this.dataSource || !this.dataSource.isInitialized) {
            throw new Error('[Cron] DataSource not initialized!');
        }

        // Guard: kiểm tra table tồn tại
        const tableExists = await this.dataSource.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'cronJob'
            );
        `);

        if (!tableExists[0]?.exists) {
            this.logger.warn('[Cron] Table "cronJob" does not exist yet. Skipping.');
            return;
        }

        this.logger.info('[Cron] Worker started polling...');
        await this.syncSystemCrons();
        await this.resetStuckJobs();

        // POLLING_INTERVAL chỉ là tần suất CHECK DB
        // Thời gian thực thi job phụ thuộc vào executeAt trong DB
        setInterval(() => this.processJobs(), this.POLLING_INTERVAL);
    }

    private async syncSystemCrons() {
        for (const [key, def] of this.jobRegistry) {
            if (def.schedule) {
                await this.addRecurringJob(key, def.schedule.cronExpression, {}, true);
                this.logger.info(`[Cron] Synced system cron: ${key} | ${def.schedule.cronExpression}`);
            }
        }
    }

    private async processJobs() {
        if (this.isPolling) return;
        this.isPolling = true;

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Chỉ lấy job có executeAt <= NOW() - tức là đến giờ chạy rồi
            const job = await queryRunner.manager.getRepository(CronJobEntity).findOne({
                where: {
                    status: EJobStatus.PENDING,
                    executeAt: LessThanOrEqual(new Date())
                },
                order: { executeAt: 'ASC' },
                lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' }
            });

            if (!job) {
                await queryRunner.commitTransaction();
                return;
            }

            job.status = EJobStatus.RUNNING;
            await queryRunner.manager.save(job);
            await queryRunner.commitTransaction();

            await this.executeJobLogic(job);

        } catch (err) {
            this.logger.error('[Cron] Polling error:', err);
            if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        } finally {
            await queryRunner.release();
            this.isPolling = false;
        }
    }

    private async executeJobLogic(job: CronJobEntity) {
        const jobDef = this.jobRegistry.get(job.name);

        try {
            if (jobDef) {
                this.logger.info(`[Cron] Executing: ${job.name} (ID: ${job.id})`);
                await jobDef.handler(job);

                if (job.cronExpression) {
                    // Tính thời điểm chạy TIẾP THEO dựa trên cronExpression
                    const interval = CronExpressionParser.parse(job.cronExpression);
                    job.executeAt = interval.next().toDate();
                    job.status = EJobStatus.PENDING;
                    job.lastError = null;
                    this.logger.info(`[Cron] Next run for ${job.name}: ${job.executeAt.toISOString()}`);
                } else {
                    job.status = EJobStatus.COMPLETED;
                }
            } else {
                this.logger.error(`[Cron] No handler for job: ${job.name}`);
                job.status = EJobStatus.FAILED;
                job.lastError = 'Handler not found in registry';
            }
        } catch (error: any) {
            this.logger.error(`[Cron] Job ${job.name} failed:`, error);
            job.status = EJobStatus.FAILED;
            job.lastError = error.message;
        }

        await this.repository.save(job);
    }

    private async resetStuckJobs() {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        await this.repository
            .createQueryBuilder()
            .update(CronJobEntity)
            .set({ status: EJobStatus.PENDING })
            .where('status = :status', { status: EJobStatus.RUNNING })
            .andWhere('executeAt < :time', { time: tenMinutesAgo })
            .execute();
    }

    // --- PUBLIC API ---

    public async addOneTimeJob(name: string, runAt: Date, data: any = {}) {
        if (!this.jobRegistry.has(name)) throw new Error(`Job "${name}" is not registered!`);
        const job = new CronJobEntity();
        job.name = name;
        job.executeAt = runAt;
        job.data = data;
        return await this.repository.save(job);
    }

    public async addRecurringJob(name: string, cronStr: string, data: any = {}, isSystem = false) {
        if (isSystem) {
            const exists = await this.repository.findOneBy({ name, cronExpression: cronStr });
            if (exists) return exists;
        } else {
            await this.repository.delete({ name, cronExpression: cronStr });
        }

        const interval = CronExpressionParser.parse(cronStr);
        const job = new CronJobEntity();
        job.name = name;
        job.cronExpression = cronStr;
        job.executeAt = interval.next().toDate(); // Lần chạy đầu tiên
        job.data = data;

        return await this.repository.save(job);
    }
}

export const cronService = new CronService();