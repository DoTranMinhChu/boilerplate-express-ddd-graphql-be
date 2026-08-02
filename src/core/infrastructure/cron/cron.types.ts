import { CronJobEntity } from './cronJob.entity';

export interface ICronJobDefinition {
    key: string;
    handler: (job: CronJobEntity) => Promise<void>;
    schedule?: {
        cronExpression: string;
        description?: string;
    };
}