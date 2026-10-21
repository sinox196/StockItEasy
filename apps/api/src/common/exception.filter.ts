import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiErrorBody } from '@stockiteasy/shared';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './errors';

const UNIQUE_CODES: [RegExp, string][] = [
  [/sku/i, 'SKU_TAKEN'],
  [/code/i, 'CODE_TAKEN'],
  [/email/i, 'EMAIL_TAKEN'],
];

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const body = this.toBody(exception);
    body.requestId = req.id;
    if (body.statusCode >= 500) {
      this.logger.error({ msg: 'unhandled error', path: req.url, requestId: req.id, err: exception instanceof Error ? exception.stack : exception });
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(e: unknown): ApiErrorBody {
    if (e instanceof AppError) return { statusCode: e.status, code: e.code, message: e.code, details: e.details };
    if (e instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        message: 'VALIDATION_FAILED',
        details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        const target = String((e.meta as { target?: unknown })?.target ?? '');
        const code = target.includes('product_barcodes') || /barcode/i.test(target)
          ? 'BARCODE_TAKEN'
          : UNIQUE_CODES.find(([re]) => re.test(target))?.[1] ?? 'CONFLICT';
        return { statusCode: HttpStatus.CONFLICT, code, message: code };
      }
      if (e.code === 'P2025') return { statusCode: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'NOT_FOUND' };
      if (e.code === 'P2023') return { statusCode: HttpStatus.BAD_REQUEST, code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' };
      if (e.code === 'P2034') return { statusCode: HttpStatus.CONFLICT, code: 'CONFLICT', message: 'CONFLICT' };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code =
        status === 429 ? 'RATE_LIMITED' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'UNKNOWN';
      return { statusCode: status, code, message: e.message };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'UNKNOWN', message: 'UNKNOWN' };
  }
}
