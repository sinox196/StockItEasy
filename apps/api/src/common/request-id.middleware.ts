import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Response } from 'express';
import { AppRequest } from './context';

/** Assigns a request id and emits one structured log line per request. */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: AppRequest, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    const start = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV === 'test') return;
      this.logger.log(
        JSON.stringify({
          requestId: req.id,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          ms: Date.now() - start,
          userId: req.user?.userId,
          organizationId: req.tenant?.organizationId,
        }),
      );
    });
    next();
  }
}
