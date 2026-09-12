import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CatalogItem } from './types/catalog-item.type';
import type { CityReferenceItem } from './types/city-reference-item.type';
import type { GameSystemReferenceItem } from './types/game-system-reference-item.type';
import {
  expandSearchQueries,
  getCitySearchScore,
} from './utils/city-search.utils';
import {
  getCanonicalCityOverride,
  isBlockedCityName,
  isDisplayableCityName,
  isNumericRegion,
} from './utils/city-name.utils';
import { getUploadLimits } from '../common/upload.constants';

const DEFAULT_CITY_COUNTRIES = ['RU', 'BY'];
const SEARCH_CANDIDATE_POOL = 400;

type CitySearchRecord = {
  id: string;
  name: string;
  region: string | null;
  geonameId: number | null;
  population: number;
  country: {
    code: string;
    name: string;
    sortOrder: number;
  };
};

function formatCityLabel(
  name: string,
  region: string | null,
  countryCode: string,
  countryName: string,
): string {
  if (region && region !== name) {
    return `${name}, ${region}`;
  }

  if (countryCode === 'BY') {
    return `${name}, ${countryName}`;
  }

  return name;
}

function sanitizeRegion(region: string | null): string | null {
  if (!region || isNumericRegion(region)) {
    return null;
  }

  return region;
}

function resolveCityName(name: string, geonameId: number | null): string | null {
  if (geonameId != null) {
    const canonical = getCanonicalCityOverride(geonameId);
    if (canonical) {
      return canonical;
    }
  }

  if (isBlockedCityName(name) || !isDisplayableCityName(name, geonameId)) {
    return null;
  }

  return name;
}

function toCityReferenceItem(city: CitySearchRecord): CityReferenceItem | null {
  const name = resolveCityName(city.name, city.geonameId);

  if (!name) {
    return null;
  }

  const region = sanitizeRegion(city.region);

  return {
    id: city.id,
    name,
    region,
    countryCode: city.country.code,
    countryName: city.country.name,
    label: formatCityLabel(name, region, city.country.code, city.country.name),
  };
}

@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  getStatuses(): Promise<CatalogItem[]> {
    return this.prisma.status.findMany({
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  getExperienceTypes(): Promise<CatalogItem[]> {
    return this.prisma.experienceType.findMany({
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  getGameSystems(): Promise<GameSystemReferenceItem[]> {
    return this.prisma.gameSystem.findMany({
      select: { id: true, name: true, description: true, sortOrder: true, isOfficial: true },
      orderBy: [{ isOfficial: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async searchCities(
    query?: string,
    countryCodes: string[] = DEFAULT_CITY_COUNTRIES,
    limit = 20,
  ): Promise<CityReferenceItem[]> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 50);
    const countries = countryCodes.length > 0 ? countryCodes : DEFAULT_CITY_COUNTRIES;
    const trimmedQuery = query?.trim() ?? '';

    if (!trimmedQuery) {
      if (countries.length === 1) {
        return this.searchPopularCitiesForCountry(countries[0], normalizedLimit);
      }

      const perCountryLimit = Math.max(5, Math.ceil(normalizedLimit / countries.length));
      const groupedResults = await Promise.all(
        countries.map((countryCode) => this.searchPopularCitiesForCountry(countryCode, perCountryLimit)),
      );

      return groupedResults.flat().slice(0, normalizedLimit);
    }

    const searchQueries = expandSearchQueries(trimmedQuery);

    if (countries.length === 1) {
      return this.searchCitiesForCountry(countries[0], searchQueries, normalizedLimit);
    }

    const perCountryLimit = Math.max(8, Math.ceil(normalizedLimit / countries.length));
    const groupedResults = await Promise.all(
      countries.map((countryCode) => this.searchCitiesForCountry(countryCode, searchQueries, perCountryLimit)),
    );

    return groupedResults
      .flat()
      .sort((left, right) => {
        const leftScore = getCitySearchScore(left.name, searchQueries);
        const rightScore = getCitySearchScore(right.name, searchQueries);

        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }

        return left.name.localeCompare(right.name, 'ru');
      })
      .slice(0, normalizedLimit);
  }

  private async searchPopularCitiesForCountry(
    countryCode: string,
    limit: number,
  ): Promise<CityReferenceItem[]> {
    const cities = await this.prisma.city.findMany({
      where: {
        isActive: true,
        country: {
          code: countryCode,
        },
      },
      select: {
        id: true,
        name: true,
        region: true,
        geonameId: true,
        population: true,
        country: {
          select: {
            code: true,
            name: true,
            sortOrder: true,
          },
        },
      },
      orderBy: [{ population: 'desc' }, { name: 'asc' }],
      take: limit,
    });

    return cities
      .map((city) => toCityReferenceItem(city))
      .filter((city): city is CityReferenceItem => city !== null);
  }

  private async searchCitiesForCountry(
    countryCode: string,
    searchQueries: string[],
    limit: number,
  ): Promise<CityReferenceItem[]> {
    const cities = await this.prisma.city.findMany({
      where: {
        isActive: true,
        country: {
          code: countryCode,
        },
        OR: searchQueries.map((searchQuery) => ({
          name: {
            contains: searchQuery,
            mode: 'insensitive' as const,
          },
        })),
      },
      select: {
        id: true,
        name: true,
        region: true,
        geonameId: true,
        population: true,
        country: {
          select: {
            code: true,
            name: true,
            sortOrder: true,
          },
        },
      },
      take: SEARCH_CANDIDATE_POOL,
    });

    return cities
      .map((city) => {
        const item = toCityReferenceItem(city);

        if (!item) {
          return null;
        }

        return {
          item,
          score: getCitySearchScore(item.name, searchQueries),
          population: city.population,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          item: CityReferenceItem;
          score: number;
          population: number;
        } => entry !== null && entry.score > 0,
      )
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (right.population !== left.population) {
          return right.population - left.population;
        }

        return left.item.name.localeCompare(right.item.name, 'ru');
      })
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  getUploadLimits() {
    return getUploadLimits();
  }
}
