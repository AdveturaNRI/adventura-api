import blockedNamesJson from '../../../prisma/data/blocked-city-names.json';
import canonicalOverridesJson from '../../../prisma/data/canonical-city-overrides.json';

const MINORITY_CYRILLIC_PATTERN = /[ӑӓӘәӜӝӞӟӤӥӦӧӨөӪӫӬӭӮӯӰӱӲӳӴӵӶӷӸӹӺӻӼӽӾӿ]/;
const RUSSIAN_CITY_NAME_PATTERN = /^[А-ЯЁ][А-Яа-яёЁ0-9\s\-–—'().]*$/;

const BLOCKED_CITY_NAMES = new Set(blockedNamesJson as string[]);
const CANONICAL_CITY_OVERRIDES = canonicalOverridesJson as Record<string, string>;

export function getBlockedCityNames(): ReadonlySet<string> {
  return BLOCKED_CITY_NAMES;
}

export function getCanonicalCityOverride(geonameId: number): string | null {
  return CANONICAL_CITY_OVERRIDES[String(geonameId)] ?? null;
}

export function isBlockedCityName(value: string): boolean {
  return BLOCKED_CITY_NAMES.has(value.trim());
}

export function isRussianCityName(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || !RUSSIAN_CITY_NAME_PATTERN.test(trimmed)) {
    return false;
  }

  if (MINORITY_CYRILLIC_PATTERN.test(trimmed)) {
    return false;
  }

  if (isBlockedCityName(trimmed)) {
    return false;
  }

  return true;
}

export function isNumericRegion(value: string | null | undefined): boolean {
  return Boolean(value && /^\d+$/.test(value.trim()));
}

export function isDisplayableCityName(name: string, geonameId?: number | null): boolean {
  if (geonameId != null && getCanonicalCityOverride(geonameId)) {
    return true;
  }

  return isRussianCityName(name);
}
