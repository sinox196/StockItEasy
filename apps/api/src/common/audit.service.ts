import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { TenantContext } from './context';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

/** Writes audit entries. Pass the transaction client so the entry commits with the change it describes. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(ctx: Pick<TenantContext, 'organizationId' | 'userId' | 'ip' | 'userAgent'> | null, entry: AuditEntry, tx?: Tx) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        organizationId: ctx?.organizationId ?? null,
        userId: ctx?.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        data: (entry.data ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent?.slice(0, 300),
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
