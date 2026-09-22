import { Injectable } from '@nestjs/common';

import { RewardsService } from '../rewards/rewards.service';
import { ArtQueueService, type ArtTaskPublicView } from './art-queue.service';
import type { GenerateArtDto } from './dto/generate-art.dto';
import { buildKandinskyPrompt, kandinskyTypeFromEntity } from './kandinsky-prompt';

@Injectable()
export class ArtStudioService {
  constructor(
    private readonly queue: ArtQueueService,
    private readonly rewardsService: RewardsService,
  ) {}

  async enqueue(userId: string, dto: GenerateArtDto): Promise<ArtTaskPublicView> {
    if (dto.entityId === 'portrait') {
      await this.rewardsService.consumePortraitGeneration(userId);
    }
    const prompt = dto.prompt.trim().slice(0, 2000);
    return this.queue.enqueue({
      userId,
      prompt,
      orientation: dto.orientation,
    });
  }

  /** Хелпер, если когда-нибудь понадобится обогащать на сервере */
  enrichPrompt(userInput: string, entityHint?: string): string {
    const type = kandinskyTypeFromEntity(entityHint ?? 'portrait');
    return buildKandinskyPrompt(userInput, type);
  }

  getStatus(userId: string, taskId: string): ArtTaskPublicView | null {
    return this.queue.getPublic(taskId, userId);
  }

  cancel(userId: string, taskId: string): ArtTaskPublicView | null {
    return this.queue.cancel(taskId, userId);
  }
}
