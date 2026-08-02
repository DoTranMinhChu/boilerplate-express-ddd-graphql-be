import { glob } from 'glob';
import path from 'path';
import { Logger } from '../../shared/utils/Logger';
import { cronService } from './cron.service';
import { ICronJobDefinition } from './cron.types';

const logger = Logger.getInstance();

export const cronJobLoader = {
    async loadJobs(): Promise<void> {
        const isProd = process.env.NODE_ENV === 'production';
        const pattern = isProd ? 'dist/**/*.job.js' : 'src/**/*.job.ts';

        const files = await glob(pattern, { absolute: true });
        logger.info(`[CronLoader] Found ${files.length} job files.`);

        for (const file of files) {
            try {
                const module = await import(file);
                const jobDef: ICronJobDefinition = module.default || module.job;

                if (jobDef && jobDef.key && typeof jobDef.handler === 'function') {
                    cronService.registerJob(jobDef);
                    logger.info(`[CronLoader] Registered: ${jobDef.key}`);
                } else {
                    logger.warn(`[CronLoader] Invalid export in: ${path.basename(file)}`);
                }
            } catch (error) {
                logger.error(`[CronLoader] Failed to load: ${file}`, error);
            }
        }

        logger.info('[CronLoader] All jobs loaded.');
    }
};