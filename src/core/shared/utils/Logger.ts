import winston from 'winston';

// Hook do module ngoài đăng ký để capture WARN/ERROR vào DB (ví dụ: một service quan sát/observability).
// Dùng function reference để tránh circular dependency.
type LogHookFn = (level: 'WARN' | 'ERROR', message: string, context?: string, meta?: any) => void;
let _logHook: LogHookFn | undefined;

/** Module quan sát/observability gọi hàm này để đăng ký hook capture log. */
export function registerLogHook(hook: LogHookFn): void {
    _logHook = hook;
}

export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
              }`;
          })
        )
      })
    ];

    // // ❗ Chỉ dùng file transport khi KHÔNG phải production
    // if (process.env.NODE_ENV !== 'production') {
    //   transports.push(
    //     new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    //     new winston.transports.File({ filename: 'logs/combined.log' })
    //   );
    // }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  error(message: string, error?: any): void {
    this.logger.error(message, { error });
    if (_logHook) _logHook('ERROR', message, undefined, error ? { error: String(error?.message ?? error) } : undefined);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
    if (_logHook) _logHook('WARN', message, undefined, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }
}