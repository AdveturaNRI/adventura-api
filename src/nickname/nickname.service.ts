import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { generateNickname } from './nickname-generator';

const MAX_UNIQUE_ATTEMPTS = 12;

@Injectable()
export class NicknameService {
  constructor(private readonly prisma: PrismaService) {}

  generateSuggestion(): string {
    return generateNickname();
  }

  async generateUniqueNickname(): Promise<string> {
    for (let attempt = 0; attempt < MAX_UNIQUE_ATTEMPTS; attempt += 1) {
      const nickname = generateNickname();
      const existing = await this.prisma.user.findUnique({
        where: { nickname },
        select: { id: true },
      });

      if (!existing) {
        return nickname;
      }
    }

    return `Гость_${Date.now().toString(36)}`;
  }
}
