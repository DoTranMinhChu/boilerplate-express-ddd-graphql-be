import { CronJobEntity } from "./cronJob.entity";

// Định nghĩa kiểu hàm xử lý
type JobHandler = (job: CronJobEntity) => Promise<void>;

export const JobRegistry: Record<string, JobHandler> = {

};