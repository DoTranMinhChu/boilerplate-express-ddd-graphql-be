// src/core/infrastructure/http/controllers/importJob.controller.ts
//
// Endpoints theo dõi tiến độ import file (async jobs).
// Hoạt động đúng cả single-process lẫn cluster mode.
//
// ── Polling ──────────────────────────────────────────────────────────────────
//   GET /api/v1/import-jobs/:jobId
//   → { id, status, progress, message, result?, error?, createdAt, updatedAt }
//
// ── SSE (Server-Sent Events) ─────────────────────────────────────────────────
//   GET /api/v1/import-jobs/:jobId/stream
//   → text/event-stream
//   → data: { type: 'progress', progress: 45, message: '...' }
//   → data: { type: 'done',     progress: 100, result: {...} }
//   → data: { type: 'error',    error: '...' }
//
// Auth: không yêu cầu (jobId là UUID ngẫu nhiên, không đoán được).
// TTL: job tự xoá sau 30 phút.

import {
    RestController, Get, Param, Res,
} from '@/core/shared/decorators/restAPI.decorators';
import { Response } from 'express';
import { importJobQueue } from '@/core/application/services/importJobQueue.service';

@RestController('/api/v1/import-jobs')
export class ImportJobController {

    // ── GET /api/v1/import-jobs/:jobId — polling ──────────────────────────────

    @Get('/:jobId')
    async getStatus(@Param('jobId') jobId: string) {
        const job = await importJobQueue.getJob(jobId);
        if (!job) {
            throw Object.assign(
                new Error('Job không tồn tại hoặc đã hết hạn (30 phút)'),
                { statusCode: 404 },
            );
        }
        return job;
    }

    // ── GET /api/v1/import-jobs/:jobId/stream — SSE ───────────────────────────
    //
    // Trong cluster mode: worker nào nhận request này đều có thể phục vụ.
    // Master broadcast JOB_EVENT đến tất cả workers → worker có SSE client thì push.
    //
    // FE dùng:
    //   const es = new EventSource(`/api/v1/import-jobs/${jobId}/stream`);
    //   es.onmessage = ({ data }) => {
    //       const e = JSON.parse(data);
    //       if (e.type === 'progress') setProgress(e.progress);
    //       if (e.type === 'done')     { setResult(e.result); es.close(); }
    //       if (e.type === 'error')    { setError(e.error);  es.close(); }
    //   };

    @Get('/:jobId/stream')
    async streamStatus(
        @Res() res: Response,
        @Param('jobId') jobId: string,
    ) {
        const job = await importJobQueue.getJob(jobId);

        if (!job) {
            res.status(404).json({ success: false, message: 'Job không tồn tại hoặc đã hết hạn' });
            return;
        }

        // ── SSE headers ───────────────────────────────────────────────────────
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Tắt nginx buffering
        res.flushHeaders(); // res.headersSent = true → framework không gửi JSON nữa

        // ── Job đã kết thúc → gửi ngay rồi đóng ─────────────────────────────
        if (job.status === 'done') {
            res.write(`data: ${JSON.stringify({ type: 'done', progress: 100, result: job.result })}\n\n`);
            res.end();
            return;
        }
        if (job.status === 'failed') {
            res.write(`data: ${JSON.stringify({ type: 'error', error: job.error })}\n\n`);
            res.end();
            return;
        }

        // ── Gửi trạng thái hiện tại ngay để FE có initial state ──────────────
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: job.progress, message: job.message })}\n\n`);

        // ── Đăng ký nhận future events (local SSE list) ───────────────────────
        // Cluster: master sẽ broadcast JOB_EVENT → ImportJobQueue._listenMaster
        //          nhận và gọi _pushSSE → ghi vào res này.
        importJobQueue.addSSEClient(jobId, res);
    }
}

export default ImportJobController;
