import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { S3Service } from '../storage/s3.service';
import { FusionBrainClient } from './fusionbrain.client';
import { sizeFromOrientation, type ArtOrientation } from './kandinsky-prompt';

export type ArtTaskStatus = 'queued' | 'running' | 'done' | 'fail' | 'cancelled';

export type ArtTask = {
  id: string;
  userId: string;
  prompt: string;
  orientation: ArtOrientation;
  width: number;
  height: number;
  status: ArtTaskStatus;
  queuePosition: number;
  createdAt: number;
  updatedAt: number;
  fusionUuid?: string;
  error?: string;
  url?: string;
  cancelRequested: boolean;
  /** Примерный прогресс 0–100 для UI */
  progress: number;
};

export type ArtTaskPublicView = {
  taskId: string;
  status: ArtTaskStatus;
  queuePosition: number;
  progress: number;
  width: number;
  height: number;
  url?: string;
  error?: string;
  message?: string;
};

const POLL_INTERVAL_MS = 2800;
const MAX_POLL_ATTEMPTS = 40; // ~2 мин
const TASK_TTL_MS = 45 * 60 * 1000;

@Injectable()
export class ArtQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ArtQueueService.name);
  private readonly tasks = new Map<string, ArtTask>();
  private readonly fifo: string[] = [];
  private pumping = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly fusion: FusionBrainClient,
    private readonly s3: S3Service,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  enqueue(params: {
    userId: string;
    prompt: string;
    orientation: ArtOrientation;
  }): ArtTaskPublicView {
    if (!this.fusion.isConfigured()) {
      const failed: ArtTask = {
        id: randomUUID(),
        userId: params.userId,
        prompt: params.prompt,
        orientation: params.orientation,
        ...sizeFromOrientation(params.orientation),
        status: 'fail',
        queuePosition: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        cancelRequested: false,
        progress: 0,
        error: 'Генерация артов временно недоступна. Проверь ключи генератора.',
      };
      this.tasks.set(failed.id, failed);
      return this.toPublic(failed);
    }

    const size = sizeFromOrientation(params.orientation);
    const task: ArtTask = {
      id: randomUUID(),
      userId: params.userId,
      prompt: params.prompt,
      orientation: params.orientation,
      width: size.width,
      height: size.height,
      status: 'queued',
      queuePosition: this.fifo.length + (this.pumping ? 1 : 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cancelRequested: false,
      progress: 0,
    };

    this.tasks.set(task.id, task);
    this.fifo.push(task.id);
    this.refreshQueuePositions();
    void this.pump();

    return this.toPublic(task);
  }

  getPublic(taskId: string, userId: string): ArtTaskPublicView | null {
    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) return null;
    return this.toPublic(task);
  }

  cancel(taskId: string, userId: string): ArtTaskPublicView | null {
    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) return null;

    if (task.status === 'done' || task.status === 'fail' || task.status === 'cancelled') {
      return this.toPublic(task);
    }

    task.cancelRequested = true;
    task.updatedAt = Date.now();

    if (task.status === 'queued') {
      const idx = this.fifo.indexOf(task.id);
      if (idx >= 0) this.fifo.splice(idx, 1);
      task.status = 'cancelled';
      task.progress = 0;
      task.error = 'Генерация отменена.';
      this.refreshQueuePositions();
    }

    return this.toPublic(task);
  }

  private refreshQueuePositions() {
    this.fifo.forEach((id, index) => {
      const task = this.tasks.get(id);
      if (task && task.status === 'queued') {
        task.queuePosition = index + 1;
        task.updatedAt = Date.now();
      }
    });
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;

    try {
      while (this.fifo.length > 0) {
        const id = this.fifo.shift()!;
        const task = this.tasks.get(id);
        if (!task) continue;

        if (task.cancelRequested) {
          task.status = 'cancelled';
          task.error = 'Генерация отменена.';
          task.updatedAt = Date.now();
          this.refreshQueuePositions();
          continue;
        }

        task.status = 'running';
        task.queuePosition = 0;
        task.progress = 8;
        task.updatedAt = Date.now();
        this.refreshQueuePositions();

        await this.runOne(task);
      }
    } finally {
      this.pumping = false;
      if (this.fifo.length > 0) {
        void this.pump();
      }
    }
  }

  private async runOne(task: ArtTask) {
    try {
      const fusionUuid = await this.fusion.runGeneration({
        prompt: task.prompt,
        width: task.width,
        height: task.height,
      });
      task.fusionUuid = fusionUuid;
      task.progress = 15;
      task.updatedAt = Date.now();

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        if (task.cancelRequested) {
          task.status = 'cancelled';
          task.error = 'Генерация отменена.';
          task.updatedAt = Date.now();
          return;
        }

        await sleep(POLL_INTERVAL_MS);

        let status;
        try {
          status = await this.fusion.getStatus(fusionUuid);
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message === 'RATE_LIMIT') {
            this.logger.warn('FusionBrain 429 — ждём дольше перед следующим poll');
            await sleep(POLL_INTERVAL_MS);
            continue;
          }
          throw error;
        }

        if (status.status === 'INITIAL' || status.status === 'PROCESSING') {
          task.progress = Math.min(90, 15 + attempt * 4);
          task.updatedAt = Date.now();
          continue;
        }

        if (status.status === 'FAIL') {
          task.status = 'fail';
          task.progress = 0;
          task.error = humanFail(status.errorDescription);
          task.updatedAt = Date.now();
          return;
        }

        if (status.status === 'DONE') {
          if (status.censored) {
            task.status = 'fail';
            task.error = 'Запрос отклонён модерацией. Переформулируй описание.';
            task.updatedAt = Date.now();
            return;
          }

          const b64 = status.images?.[0];
          if (!b64) {
            task.status = 'fail';
            task.error = 'Генератор не вернул изображение.';
            task.updatedAt = Date.now();
            return;
          }

          const buffer = Buffer.from(b64, 'base64');
          const key = `art-studio/${task.userId}/${Date.now()}-${task.id.slice(0, 8)}.jpg`;
          await this.s3.putObject({
            key,
            body: buffer,
            contentType: 'image/jpeg',
          });
          task.url = await this.s3.getSignedObjectUrl(key);
          task.status = 'done';
          task.progress = 100;
          task.updatedAt = Date.now();
          this.logger.log(`Art done task=${task.id} ${task.width}x${task.height}`);
          return;
        }

        task.status = 'fail';
        task.error = 'Неизвестный статус генерации.';
        task.updatedAt = Date.now();
        return;
      }

      task.status = 'fail';
      task.error = 'Генерация заняла слишком много времени. Попробуй ещё раз.';
      task.updatedAt = Date.now();
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`runOne failed task=${task.id}: ${raw}`);
      task.status = 'fail';
      task.error = humanFail(raw);
      task.updatedAt = Date.now();
    }
  }

  private cleanupExpired() {
    const cutoff = Date.now() - TASK_TTL_MS;
    for (const [id, task] of this.tasks) {
      if (task.updatedAt < cutoff) {
        this.tasks.delete(id);
      }
    }
  }

  private toPublic(task: ArtTask): ArtTaskPublicView {
    let message: string | undefined;
    if (task.status === 'queued') {
      message = `В очереди (позиция ${Math.max(1, task.queuePosition)})`;
    } else if (task.status === 'running') {
      message = 'Рисуем арт…';
    } else if (task.status === 'cancelled') {
      message = 'Отменено';
    }

    return {
      taskId: task.id,
      status: task.status,
      queuePosition: task.queuePosition,
      progress: task.progress,
      width: task.width,
      height: task.height,
      url: task.url,
      error: task.error,
      message,
    };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanFail(raw?: string): string {
  const text = (raw ?? '').toLowerCase();
  if (!text) return 'Не удалось сгенерировать арт. Попробуй ещё раз.';
  if (text.includes('censored') || text.includes('модерац')) {
    return 'Запрос отклонён модерацией. Переформулируй описание.';
  }
  if (text.includes('429') || text.includes('rate')) {
    return 'Слишком много запросов. Подожди немного и попробуй снова.';
  }
  if (text.includes('unavailable') || text.includes('недоступ')) {
    return 'Генератор временно недоступен. Попробуй позже.';
  }
  return 'Не удалось сгенерировать арт. Попробуй ещё раз.';
}
