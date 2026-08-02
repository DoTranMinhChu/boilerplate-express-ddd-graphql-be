// ─────────────────────────────────────────────────────────────────────────────
// SwaggerLoader
//
// Mount 2 endpoints:
//   GET /api-docs           → Swagger UI (HTML, dùng CDN — không cần npm install)
//   GET /api-docs/swagger.json → Raw OpenAPI 3.0 JSON spec
//
// Spec được build lazily (lần đầu request) và cache trong memory.
// Trong dev, thêm query `?refresh=1` để rebuild: GET /api-docs/swagger.json?refresh=1
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { swaggerBuilder } from './swagger.builder';
import { Logger } from '../../shared/utils/Logger';

const logger = Logger.getInstance();

// Cache spec trong memory
let cachedSpec: any = null;

function getSpec(req: Request): any {
    const forceRefresh = req.query['refresh'] === '1';

    if (!cachedSpec || forceRefresh) {
        // Detect server URL từ request
        const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol ?? 'http';
        const host = (req.headers['x-forwarded-host'] as string) ?? req.headers['host'] ?? 'localhost:3000';
        const serverUrl = `${proto}://${host}`;

        logger.info('[Swagger] Building OpenAPI spec...');
        try {
            cachedSpec = swaggerBuilder.buildSpec(serverUrl);
            logger.info(
                `[Swagger] Spec built: ${Object.keys(cachedSpec.paths ?? {}).length} paths, ` +
                `${Object.keys(cachedSpec.components?.schemas ?? {}).length} schemas`,
            );
        } catch (err) {
            logger.error('[Swagger] Error building spec:', err);
            throw err;
        }
    }

    return cachedSpec;
}

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    /* Ẩn logo Swagger mặc định, giữ giao diện gọn */
    .swagger-ui .topbar { background-color: #1a6b3c; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
    .swagger-ui .topbar-wrapper .link { visibility: hidden; }
    .swagger-ui .topbar-wrapper::after {
      content: 'API Docs';
      color: #fff;
      font-size: 1.4rem;
      font-weight: bold;
      padding-left: 1rem;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api-docs/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        tryItOutEnabled: true,
        persistAuthorization: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        requestInterceptor: function (request) {
          // Tự động thêm Bearer token từ Authorization đã lưu
          return request;
        },
      });
    };
  </script>
</body>
</html>`;

/**
 * Tạo Express router với Swagger UI và JSON spec endpoints.
 * Gọi hàm này 1 lần rồi mount vào app.
 */
export function createSwaggerRouter(): Router {
    const router = Router();

    // ── GET /api-docs → Swagger UI ─────────────────────────────────────────
    router.get('/', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(SWAGGER_UI_HTML);
    });

    // ── GET /api-docs/swagger.json → OpenAPI JSON ─────────────────────────
    router.get('/swagger.json', (req: Request, res: Response) => {
        try {
            const spec = getSpec(req);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.json(spec);
        } catch (err) {
            res.status(500).json({
                error: 'Failed to generate API spec',
                message: err instanceof Error ? err.message : String(err),
            });
        }
    });

    // ── GET /api-docs/swagger.yaml → OpenAPI YAML (optional, human-readable) ─
    router.get('/swagger.yaml', (req: Request, res: Response) => {
        try {
            const spec = getSpec(req);
            const yaml = jsonToYaml(spec);
            res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(yaml);
        } catch (err) {
            res.status(500).send(`Error generating YAML: ${err}`);
        }
    });

    return router;
}

// ─── Minimal JSON → YAML converter (không cần thêm package) ──────────────────

function jsonToYaml(obj: any, indent = 0): string {
    const pad = '  '.repeat(indent);

    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'boolean') return obj ? 'true' : 'false';
    if (typeof obj === 'number') return String(obj);
    if (typeof obj === 'string') {
        // Multi-line hoặc ký tự đặc biệt → dùng block scalar
        if (obj.includes('\n') || obj.includes(':') || obj.includes('#') ||
            obj.startsWith('{') || obj.startsWith('[') || obj.startsWith('`')) {
            const escaped = obj.replace(/'/g, "''");
            return `'${escaped}'`;
        }
        return obj;
    }
    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        return obj.map(item => `\n${pad}- ${jsonToYaml(item, indent + 1)}`).join('');
    }
    if (typeof obj === 'object') {
        const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
        if (entries.length === 0) return '{}';
        return entries
            .map(([k, v]) => {
                const valStr = jsonToYaml(v, indent + 1);
                if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                    return `\n${pad}${k}:${valStr}`;
                }
                if (Array.isArray(v)) {
                    return `\n${pad}${k}:${valStr}`;
                }
                return `\n${pad}${k}: ${valStr}`;
            })
            .join('');
    }
    return String(obj);
}
