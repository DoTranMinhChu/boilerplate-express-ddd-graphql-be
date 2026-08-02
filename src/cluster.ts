// src/cluster.ts
//
// Entry point cho cluster mode.
// Thay thế `node dist/server.js` bằng `node dist/cluster.js` khi cần nhiều worker.
//
// ── Master process ────────────────────────────────────────────────────────────
//   Không chạy Express. Chỉ quản lý job state và route IPC.
//   - Nhận JOB_CREATE / JOB_UPDATE từ workers → lưu vào Map, broadcast JOB_EVENT
//   - Nhận JOB_GET từ worker → reply JOB_GET_REPLY về đúng worker đó
//   - Fork N workers (mặc định = số CPU)
//   - Auto-restart worker khi crash
//
// ── Worker process ────────────────────────────────────────────────────────────
//   Chạy Express bình thường (server.ts).
//   ImportJobQueue tự detect IS_CLUSTER_WORKER → dùng IPC thay vì in-memory.
//
// Dùng:
//   npm run start:cluster
//   WEB_CONCURRENCY=4 node dist/cluster.js

import cluster from 'cluster';
import os from 'os';
import { ImportJob, ClusterMsg } from './core/application/services/importJobQueue.service';

const NUM_WORKERS = parseInt(process.env.WEB_CONCURRENCY || String(os.cpus().length), 10);
const JOB_TTL_MS  = 30 * 60 * 1000;

if (cluster.isPrimary) {
    // ── Master ────────────────────────────────────────────────────────────────

    const jobs = new Map<string, ImportJob>();

    // Broadcast 1 message đến tất cả workers đang sống
    function broadcast(msg: ClusterMsg): void {
        for (const worker of Object.values(cluster.workers ?? {})) {
            if (worker && !worker.isDead()) {
                try { worker.send(msg); } catch { /* worker đang chết */ }
            }
        }
    }

    cluster.on('message', (sender, raw: ClusterMsg) => {
        switch (raw.type) {

            case 'JOB_CREATE': {
                const { job } = raw;
                jobs.set(job.id, { ...job });
                // TTL: tự xoá sau 30 phút
                setTimeout(() => jobs.delete(job.id), JOB_TTL_MS);
                break;
            }

            case 'JOB_UPDATE': {
                const { jobId, patch, event } = raw;
                const existing = jobs.get(jobId);
                if (existing) {
                    Object.assign(existing, patch);
                }
                // Broadcast event đến tất cả workers (kể cả sender)
                // để mọi worker có SSE client đều push được
                if (event) {
                    broadcast({ type: 'JOB_EVENT', jobId, event });
                }
                break;
            }

            case 'JOB_GET': {
                const { requestId, jobId } = raw;
                const job = jobs.get(jobId) ?? null;
                try {
                    sender.send({ type: 'JOB_GET_REPLY', requestId, job } satisfies ClusterMsg);
                } catch { /* worker đã chết trước khi reply */ }
                break;
            }
        }
    });

    // Fork workers
    console.log(`[Cluster] Master PID ${process.pid} — forking ${NUM_WORKERS} workers`);
    for (let i = 0; i < NUM_WORKERS; i++) {
        cluster.fork();
    }

    // Tự restart worker khi crash
    cluster.on('exit', (worker, code, signal) => {
        console.warn(`[Cluster] Worker ${worker.process.pid} exited (code=${code} signal=${signal}). Restarting...`);
        cluster.fork();
    });

    cluster.on('online', (worker) => {
        console.log(`[Cluster] Worker ${worker.process.pid} online`);
    });

} else {
    // ── Worker ────────────────────────────────────────────────────────────────
    // Chạy Express server bình thường.
    // ImportJobQueue tự detect IS_CLUSTER_WORKER qua `typeof process.send === 'function'`.
    require('./server');
}
