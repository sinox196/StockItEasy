import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { Response } from 'express';
import { from, Observable, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { AppRequest } from './context';
import { AppError } from './errors';

const TTL_HOURS = 48;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Idempotency for retried writes (mobile reconnects, double clicks, network retries).
 *
 * When a mutating request carries an `Idempotency-Key` header, the first call
 * reserves the key, executes, and stores the response. A retry with the same key
 * and the same payload replays the stored response without executing again; the
 * same key with a different payload is rejected. Failed calls release the key so
 * the client can retry.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.headers['idempotency-key'];
    if (!MUTATING.has(req.method) || typeof key !== 'string' || !key) return next.handle();
    if (key.length > 200) throw new AppError('VALIDATION_FAILED', 400, { header: 'Idempotency-Key' });

    const scope = `${req.tenant?.organizationId ?? 'none'}:${req.user?.userId ?? 'anon'}`;
    const requestHash = createHash('sha256')
      .update(`${req.method} ${req.baseUrl}${req.path} ${JSON.stringify(req.body ?? {})}`)
      .digest('hex');

    return from(this.reserve(scope, key, requestHash)).pipe(
      mergeMap((existing) => {
        if (existing) {
          res.status(existing.statusCode);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(existing.body);
        }
        return next.handle().pipe(
          mergeMap((body) =>
            from(
              this.prisma.idempotencyRecord.update({
                where: { scope_key: { scope, key } },
                data: { statusCode: res.statusCode, responseBody: (body ?? null) as Prisma.InputJsonValue },
              }),
            ).pipe(mergeMap(() => of(body))),
          ),
          catchError((err) =>
            from(this.prisma.idempotencyRecord.delete({ where: { scope_key: { scope, key } } }).catch(() => undefined)).pipe(
              mergeMap(() => {
                throw err;
              }),
            ),
          ),
        );
      }),
    );
  }

  private async reserve(scope: string, key: string, requestHash: string): Promise<{ statusCode: number; body: unknown } | null> {
    try {
      await this.prisma.idempotencyRecord.create({
        data: { scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000) },
      });
      return null;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    const existing = await this.prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
    if (!existing) throw AppError.conflict();
    if (existing.requestHash !== requestHash) throw AppError.conflict('IDEMPOTENCY_CONFLICT');
    if (existing.statusCode === null) throw AppError.conflict('CONFLICT', { reason: 'IN_PROGRESS' });
    return { statusCode: existing.statusCode, body: existing.responseBody };
  }
}
