import { Global, Injectable, Module } from '@nestjs/common';
import { Tx } from '../prisma/prisma.service';

/**
 * Gap-free per-organization numbering, safe under concurrency: the counter row
 * is incremented with an atomic upsert inside the caller's transaction.
 */
@Injectable()
export class SequenceService {
  async next(tx: Tx, organizationId: string, prefix: string, date = new Date()): Promise<string> {
    const year = date.getUTCFullYear();
    const key = `${prefix}-${year}`;
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO document_sequences ("organizationId", key, "nextValue")
      VALUES (${organizationId}::uuid, ${key}, 2)
      ON CONFLICT ("organizationId", key) DO UPDATE SET "nextValue" = document_sequences."nextValue" + 1
      RETURNING "nextValue" - 1 AS value`;
    return `${key}-${String(rows[0].value).padStart(5, '0')}`;
  }
}

@Global()
@Module({ providers: [SequenceService], exports: [SequenceService] })
export class SequenceModule {}
