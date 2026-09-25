import {
  compareWandererFeedRank,
  questionnaireRichness,
  wandererFeedRankScore,
} from './wanderer-feed-rank.util';
import type { QuestionnaireCompletionInput } from './questionnaire-completion.util';

function completion(overrides: Partial<QuestionnaireCompletionInput> = {}): QuestionnaireCompletionInput {
  return {
    roles: ['player'],
    hasProfileCard: false,
    about: 'Ищу стол',
    description: null,
    age: 25,
    experienceTypesCount: 1,
    availability: 'вечера',
    cityId: 'city-1',
    citiesCount: 1,
    playsOnline: true,
    timezone: 'Europe/Moscow',
    systems: ['D&D'],
    readyToLearnNew: false,
    openToAnySystem: false,
    ...overrides,
  };
}

describe('wanderer feed rank', () => {
  const now = Date.parse('2026-09-25T12:00:00.000Z');

  it('prefers a richer questionnaire over a thin one', () => {
    expect(
      questionnaireRichness(
        completion({
          hasProfileCard: true,
          description: 'Длинное описание стола и опыта мастера '.repeat(8),
          systems: ['D&D', 'Blades', 'CoC', 'PBTA'],
        }),
      ),
    ).toBeGreaterThan(questionnaireRichness(completion()));
  });

  it('ranks recent + rewarded people above idle empty profiles', () => {
    const richer = {
      completion: completion({ hasProfileCard: true, description: 'Много текста про опыт и столы' }),
      lastSeenAt: new Date(now - 30 * 60 * 1000),
      updatedAt: new Date(now - 30 * 60 * 1000),
      rewards: [{ badgeType: 'founding_dm' as const }, { badgeType: 'alpha_tester' as const }],
    };
    const thinner = {
      completion: completion({ about: 'ок', systems: [] }),
      lastSeenAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      rewards: [],
    };

    expect(compareWandererFeedRank(richer, thinner, now)).toBeLessThan(0);
  });

  it('puts a just-seen person above a richer profile that has been idle', () => {
    const justSeen = {
      completion: completion(),
      lastSeenAt: new Date(now - 10 * 60 * 1000),
      updatedAt: new Date(now - 10 * 60 * 1000),
      rewards: [],
    };
    const idleRich = {
      completion: completion({
        hasProfileCard: true,
        description: 'Длинное описание стола и опыта мастера '.repeat(8),
        systems: ['D&D', 'Blades', 'CoC', 'PBTA'],
      }),
      lastSeenAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
      rewards: [{ badgeType: 'alpha_tester' as const }],
    };

    expect(compareWandererFeedRank(justSeen, idleRich, now)).toBeLessThan(0);
  });

  it('boosts people who actually write and call', () => {
    const seen = new Date(now - 20 * 60 * 1000);
    const quiet = {
      completion: completion(),
      lastSeenAt: seen,
      updatedAt: seen,
      rewards: [] as const,
      messageCount: 0,
      callCount: 0,
      diceRollCount: 0,
    };
    const chatty = {
      ...quiet,
      messageCount: 40,
      callCount: 4,
      diceRollCount: 12,
    };

    expect(compareWandererFeedRank(chatty, quiet, now)).toBeLessThan(0);
  });

  it('treats dice rolls as their own activity, not just extra messages', () => {
    const seen = new Date(now - 20 * 60 * 1000);
    const noDice = {
      completion: completion(),
      lastSeenAt: seen,
      updatedAt: seen,
      rewards: [] as const,
      messageCount: 10,
      callCount: 0,
      diceRollCount: 0,
    };
    const roller = {
      ...noDice,
      diceRollCount: 20,
    };

    expect(compareWandererFeedRank(roller, noDice, now)).toBeLessThan(0);
    expect(wandererFeedRankScore(roller, now) - wandererFeedRankScore(noDice, now)).toBeCloseTo(0.04, 8);
  });
});
