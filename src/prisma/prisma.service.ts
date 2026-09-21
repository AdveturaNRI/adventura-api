import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const CONNECT_ATTEMPTS = 10;
const CONNECT_DELAY_MS = 500;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    let lastError: unknown;
    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
      try {
        await this.$connect();
        if (attempt > 1) {
          this.logger.log(`Postgres connected on attempt ${attempt}`);
        }
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Postgres not ready (attempt ${attempt}/${CONNECT_ATTEMPTS}): ${message.split('\n')[0]}`,
        );
        if (attempt < CONNECT_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, CONNECT_DELAY_MS));
        }
      }
    }
    throw lastError;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
