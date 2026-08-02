// src/core/application/services/importJobQueue.service.ts
//
// Cluster-aware job queue cho async import.
//
// ── Chế độ single-process (dev / không dùng cluster) ─────────────────────────
//   In-memory Map bình thường. Không có IPC.
//
// ── Chế độ cluster worker (dùng cluster.ts làm entry point) ──────────────────
//   Master process = source of truth cho job state.
//   Worker → Master: JOB_CREATE, JOB_UPDATE, JOB_GET
//   Master → All Workers: JOB_EVENT (broadcast progress/done/error)
//   Mỗi Worker giữ local SSE clients của riêng mình.
//   Khi Master broadcast JOB_EVENT → Worker nào có SSE client thì push.
//
// FE không cần biết worker nào xử lý — bất kỳ worker nào cũng trả lời được.

import { randomUUID } from 'crypto';
import { Response } from 'express';

export type ImportJobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface ImportJob {
    id: string;
    status: ImportJobStatus;
    progress: number;
    message: string;
    result?: any;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type ProgressCallback = (percent: number, message: string) => void;

// IPC message types (Worker ↔ Master)
export type ClusterMsg =
    | { type: 'JOB_CREATE';    job: ImportJob }
    | { type: 'JOB_UPDATE';    jobId: string; patch: Partial<ImportJob>; event: object | null }
    | { type: 'JOB_GET';       requestId: string; jobId: string }
    | { type: 'JOB_GET_REPLY'; requestId: string; job: ImportJob | null }
    | { type: 'JOB_EVENT';     jobId: string; event: object };

const JOB_TTL_MS    = 30 * 60 * 1000;   // 30 phút
const IPC_TIMEOUT   = 5_000;             // timeout cho JOB_GET reply

// Detect cluster worker: process.send tồn tại chỉ khi được fork bởi cluster master
const IS_CLUSTER_WORKER = typeof process.send === 'function';

export class ImportJobQueue {
    private static _instance: ImportJobQueue;

    // Single-process: source of truth
    // Cluster worker: local cache cho jobs mà worker này đang xử lý
    private readonly jobs    = new Map<string, ImportJob>();
    // SSE clients kết nối đến worker này (local, không share qua workers)
    private readonly clients = new Map<string, Response[]>();
    // Pending JOB_GET requests chờ master reply (cluster worker only)
    private readonly pending = new Map<string, (job: ImportJob | null) => void>();

    private constructor() {
        if (IS_CLUSTER_WORKER) {
            this._listenMaster();
        }
    }

    static getInstance(): ImportJobQueue {
        if (!this._instance) this._instance = new ImportJobQueue();
        return this._instance;
    }

    // ── Tạo job ───────────────────────────────────────────────────────────────

    createJob(): string {
        const id  = randomUUID();
        const now = new Date();
        const job: ImportJob = {
            id, status: 'pending', progress: 0,
            message: 'Đang chờ xử lý...', createdAt: now, updatedAt: now,
        };

        if (IS_CLUSTER_WORKER) {
            process.send!({ type: 'JOB_CREATE', job } satisfies ClusterMsg);
        } else {
            this.jobs.set(id, job);
            this._scheduleTTL(id);
        }
        return id;
    }

    // ── Cập nhật tiến độ ─────────────────────────────────────────────────────

    updateProgress(jobId: string, progress: number, message: string): void {
        const p   = Math.min(Math.round(progress), 99);
        const now = new Date();
        const patch: Partial<ImportJob> = { status: 'processing', progress: p, message, updatedAt: now };
        const event = { type: 'progress', progress: p, message };

        if (IS_CLUSTER_WORKER) {
            process.send!({ type: 'JOB_UPDATE', jobId, patch, event } satisfies ClusterMsg);
        } else {
            const job = this.jobs.get(jobId);
            if (!job) return;
            Object.assign(job, patch);
            this._pushSSE(jobId, event);
        }
    }

    // ── Hoàn thành ────────────────────────────────────────────────────────────

    complete(jobId: string, result: any): void {
        const now   = new Date();
        const patch: Partial<ImportJob> = { status: 'done', progress: 100, result, updatedAt: now };
        const event = { type: 'done', progress: 100, result };

        if (IS_CLUSTER_WORKER) {
            process.send!({ type: 'JOB_UPDATE', jobId, patch, event } satisfies ClusterMsg);
        } else {
            const job = this.jobs.get(jobId);
            if (!job) return;
            Object.assign(job, patch);
            this._pushSSE(jobId, event);
            this._closeSSE(jobId);
        }
    }

    // ── Thất bại ─────────────────────────────────────────────────────────────

    fail(jobId: string, error: string): void {
        const now   = new Date();
        const patch: Partial<ImportJob> = { status: 'failed', error, updatedAt: now };
        const event = { type: 'error', error };

        if (IS_CLUSTER_WORKER) {
            process.send!({ type: 'JOB_UPDATE', jobId, patch, event } satisfies ClusterMsg);
        } else {
            const job = this.jobs.get(jobId);
            if (!job) return;
            Object.assign(job, patch);
            this._pushSSE(jobId, event);
            this._closeSSE(jobId);
        }
    }

    // ── Lấy trạng thái (async vì cluster phải hỏi master) ───────────────────

    async getJob(jobId: string): Promise<ImportJob | undefined> {
        if (!IS_CLUSTER_WORKER) {
            return this.jobs.get(jobId);
        }

        return new Promise((resolve) => {
            const requestId = randomUUID();

            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                resolve(undefined);
            }, IPC_TIMEOUT);

            this.pending.set(requestId, (job) => {
                clearTimeout(timer);
                resolve(job ?? undefined);
            });

            process.send!({ type: 'JOB_GET', requestId, jobId } satisfies ClusterMsg);
        });
    }

    // ── Đăng ký SSE client (luôn local) ─────────────────────────────────────

    addSSEClient(jobId: string, res: Response): void {
        const list = this.clients.get(jobId) ?? [];
        list.push(res);
        this.clients.set(jobId, list);
        res.on('close', () => {
            const updated = (this.clients.get(jobId) ?? []).filter(r => r !== res);
            this.clients.set(jobId, updated);
        });
    }

    // ── Helper: tạo callback cho service ────────────────────────────────────

    makeProgressCallback(jobId: string): ProgressCallback {
        return (percent, message) => this.updateProgress(jobId, percent, message);
    }

    // ── Cluster worker: lắng nghe broadcast từ master ────────────────────────

    private _listenMaster(): void {
        process.on('message', (msg: ClusterMsg) => {
            switch (msg.type) {
                case 'JOB_EVENT':
                    // Master broadcast → push SSE đến clients trên worker này
                    this._pushSSE(msg.jobId, msg.event);
                    if ((msg.event as any).type === 'done' || (msg.event as any).type === 'error') {
                        this._closeSSE(msg.jobId);
                    }
                    break;

                case 'JOB_GET_REPLY':
                    // Master reply cho JOB_GET request
                    this.pending.get(msg.requestId)?.(msg.job);
                    this.pending.delete(msg.requestId);
                    break;
            }
        });
    }

    // ── Private: push SSE payload đến tất cả local clients của job ──────────

    private _pushSSE(jobId: string, data: object): void {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        for (const res of this.clients.get(jobId) ?? []) {
            try { res.write(payload); } catch { /* disconnected */ }
        }
    }

    private _closeSSE(jobId: string): void {
        for (const res of this.clients.get(jobId) ?? []) {
            try { res.end(); } catch { /* already closed */ }
        }
        this.clients.delete(jobId);
    }

    // ── Private: TTL cleanup (single-process only) ───────────────────────────

    private _scheduleTTL(jobId: string): void {
        setTimeout(() => this.jobs.delete(jobId), JOB_TTL_MS);
    }
}

export const importJobQueue = ImportJobQueue.getInstance();
