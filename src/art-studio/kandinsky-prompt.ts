export type ArtOrientation = 'portrait' | 'landscape' | 'square';

export type KandinskyArtType = 'npc' | 'location' | 'tavern' | 'item';

const TYPE_STYLES: Record<KandinskyArtType, string> = {
  npc: 'детализированный портрет персонажа, фэнтези арт, концепт-арт для D&D, выразительное лицо, кинематографичное освещение',
  location:
    'эпический фэнтези пейзаж, детализированное окружение, атмосферная глубина, широкий план, высокое разрешение',
  tavern:
    'уютный интерьер фэнтези таверны, теплый свет камина, детализированное дерево, глубина сцены',
  item: 'магический фэнтези артефакт, предмет на нейтральном тёмном фоне, мягкое свечение рун, высокая детализация',
};

/** Kandinsky обучен на русском — перевод на EN не нужен */
export function buildKandinskyPrompt(
  userInput: string,
  type: KandinskyArtType,
): string {
  const input = userInput.trim();
  return `${input}, ${TYPE_STYLES[type]}, шедевр цифровой живописи`;
}

export function kandinskyTypeFromEntity(
  entityId: string,
): KandinskyArtType {
  switch (entityId) {
    case 'landscape':
      return 'location';
    case 'interior':
      return 'tavern';
    case 'item':
    case 'token':
      return 'item';
    case 'portrait':
    default:
      return 'npc';
  }
}

export function orientationFromEntity(entityId: string): ArtOrientation {
  switch (entityId) {
    case 'landscape':
    case 'interior':
      return 'landscape';
    case 'item':
    case 'token':
      return 'square';
    case 'portrait':
    default:
      return 'portrait';
  }
}

export function sizeFromOrientation(orientation: ArtOrientation): {
  width: number;
  height: number;
} {
  switch (orientation) {
    case 'landscape':
      return { width: 1024, height: 768 };
    case 'square':
      return { width: 1024, height: 1024 };
    case 'portrait':
    default:
      return { width: 768, height: 1024 };
  }
}
