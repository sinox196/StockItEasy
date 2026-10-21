import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AutopilotModule } from '../autopilot/autopilot.module';
import { AutopilotService } from '../autopilot/autopilot.service';

/**
 * Background jobs (BullMQ). Enabled when REDIS_URL is set:
 * - nightly Stock Autopilot recomputation for every organization;
 * - purge of expired idempotency records.
 * Without Redis, recommendations are recomputed on demand (stale after 6 h).
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly autopilot: AutopilotService,
  ) {}

  async onModuleInit() {
    const url = env().REDIS_URL;
    if (!url || env().NODE_ENV === 'test') return;
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue('stockiteasy', { connection: this.connection });
    this.worker = new Worker(
      'stockiteasy',
      async (job) => {
        if (job.name === 'autopilot-nightly') {
          const orgs = await this.prisma.organization.findMany({ select: { id: true } });
          for (const o of orgs) await this.autopilot.run(o.id).catch((e) => this.logger.error(`autopilot ${o.id}: ${String(e)}`));
        }
        if (job.name === 'purge-idempotency') {
          await this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        }
      },
      { connection: this.connection, concurrency: 1 },
    );
    await this.queue.add('autopilot-nightly', {}, { repeat: { pattern: '0 3 * * *', tz: 'Africa/Tunis' }, jobId: 'autopilot-nightly' });
    await this.queue.add('purge-idempotency', {}, { repeat: { pattern: '30 3 * * *', tz: 'Africa/Tunis' }, jobId: 'purge-idempotency' });
    this.logger.log('BullMQ scheduler started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}

@Module({ imports: [AutopilotModule], providers: [JobsService] })
export class JobsModule {}
