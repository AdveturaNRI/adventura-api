import { BadRequestException } from '@nestjs/common';

export const MAX_GAME_SYSTEM_NAME_LENGTH = 60;

export function normalizeGameSystemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

export function resolveGameSystemNames(
  inputNames: string[],
  catalogNames: string[],
): string[] {
  const catalogByNormalized = new Map(
    catalogNames.map((name) => [normalizeGameSystemName(name), name]),
  );
  const resolved: string[] = [];
  const seenNormalized = new Set<string>();

  for (const rawName of inputNames) {
    const trimmed = rawName.trim();

    if (!trimmed) {
      throw new BadRequestException('Название системы не может быть пустым');
    }

    if (trimmed.length > MAX_GAME_SYSTEM_NAME_LENGTH) {
      throw new BadRequestException('Название системы слишком длинное');
    }

    const normalized = normalizeGameSystemName(trimmed);

    if (seenNormalized.has(normalized)) {
      throw new BadRequestException('Система указана несколько раз');
    }

    seenNormalized.add(normalized);
    resolved.push(catalogByNormalized.get(normalized) ?? trimmed);
  }

  return resolved;
}
