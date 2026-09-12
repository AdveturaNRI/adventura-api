const LATIN_TO_CYRILLIC_LAYOUT: Record<string, string> = {
  '`': 'ё',
  q: 'й',
  w: 'ц',
  e: 'у',
  r: 'к',
  t: 'е',
  y: 'н',
  u: 'г',
  i: 'ш',
  o: 'щ',
  p: 'з',
  '[': 'х',
  ']': 'ъ',
  a: 'ф',
  s: 'ы',
  d: 'в',
  f: 'а',
  g: 'п',
  h: 'р',
  j: 'о',
  k: 'л',
  l: 'д',
  ';': 'ж',
  "'": 'э',
  z: 'я',
  x: 'ч',
  c: 'с',
  v: 'м',
  b: 'и',
  n: 'т',
  m: 'ь',
  ',': 'б',
  '.': 'ю',
};

const LATIN_HOMOGLYPH_TO_CYRILLIC: Record<string, string> = {
  a: 'а',
  c: 'с',
  e: 'е',
  o: 'о',
  p: 'р',
  x: 'х',
  y: 'у',
  k: 'к',
  m: 'м',
  t: 'т',
  h: 'н',
  b: 'в',
  i: 'и',
};

export function expandSearchQueries(query: string): string[] {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>([trimmed]);
  const layoutVariant = convertLatinLayoutToCyrillic(trimmed);
  const homoglyphVariant = convertLatinHomoglyphsToCyrillic(trimmed);

  if (layoutVariant) {
    variants.add(layoutVariant);
  }

  if (homoglyphVariant) {
    variants.add(homoglyphVariant);
  }

  return [...variants];
}

function convertLatinHomoglyphsToCyrillic(value: string): string | null {
  if (!/^[a-z]+$/i.test(value)) {
    return null;
  }

  const converted = [...value.toLowerCase()]
    .map((char) => LATIN_HOMOGLYPH_TO_CYRILLIC[char] ?? char)
    .join('');

  if (converted === value.toLowerCase()) {
    return null;
  }

  return converted;
}

function convertLatinLayoutToCyrillic(value: string): string | null {
  if (!/^[a-z[\];',.`]+$/i.test(value)) {
    return null;
  }

  return [...value.toLowerCase()].map((char) => LATIN_TO_CYRILLIC_LAYOUT[char] ?? char).join('');
}

export function getCitySearchScore(cityName: string, queries: string[]): number {
  const nameLower = cityName.toLocaleLowerCase('ru-RU');
  let bestScore = 0;

  for (const query of queries) {
    const normalizedQuery = query.toLocaleLowerCase('ru-RU');

    if (!normalizedQuery) {
      continue;
    }

    if (nameLower === normalizedQuery) {
      bestScore = Math.max(bestScore, 10_000);
      continue;
    }

    if (nameLower.startsWith(normalizedQuery)) {
      const prefixScore =
        5_000 + (normalizedQuery.length / Math.max(nameLower.length, 1)) * 1_000;
      bestScore = Math.max(bestScore, prefixScore);
      continue;
    }

    const wordPrefixScore = nameLower
      .split(/[\s-]+/)
      .some((word) => word.startsWith(normalizedQuery));

    if (wordPrefixScore) {
      bestScore = Math.max(bestScore, 3_000 + normalizedQuery.length * 20);
      continue;
    }

    const index = nameLower.indexOf(normalizedQuery);

    if (index >= 0) {
      bestScore = Math.max(bestScore, 1_000 - index * 5 + normalizedQuery.length * 15);
    }
  }

  return bestScore;
}
