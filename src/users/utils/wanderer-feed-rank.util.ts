import { BADGE_DISPLAY_PRIORITY, type RewardBadgeTypeId } from '../../rewards/rewards.constants';
import type { QuestionnaireCompletionInput } from './questionnaire-completion.util';
import { calculateQuestionnaireCompletionPercent } from './questionnaire-completion.util';

const BADGE_WEIGHT: Record<RewardBadgeTypeId, number> = {
  tavern_keeper: 8,
  founding_dm: 6,
  alpha_tester: 4,
  bug_hunter: 3,
  early_arrival: 1,
};

/** Same calendar day / this morning vs a couple hours ago should not reshuffle the deck. */
const ONLINE_PLATEAU_MS = 16 * 60 * 60 * 1000;
const ONLINE_HALF_LIFE_MS = 60 * 60 * 60 * 1000;
const ONLINE_FLOOR_MS = 14 * 24 * 60 * 60 * 1000;

export type WandererFeedRankInput = {
  completion: QuestionnaireCompletionInput;
  lastSeenAt: Date | null;
  updatedAt: Date;
  rewards: ReadonlyArray<{ badgeType: RewardBadgeTypeId }>;
  messageCount?: number;
  callCount?: number;
  diceRollCount?: number;
};

function textWeight(value: string | null | undefined, softCap: number): number {
  const length = value?.trim().length ?? 0;
  if (length <= 0 || softCap <= 0) {
    return 0;
  }
  return Math.min(1, length / softCap);
}

/** How much extra the person actually wrote, beyond the required checkboxes. */
export function questionnaireRichness(input: QuestionnaireCompletionInput): number {
  const required = calculateQuestionnaireCompletionPercent(input) / 100;
  const extras =
    (input.hasProfileCard ? 1 : 0) +
    textWeight(input.about, 280) +
    textWeight(input.description, 600) +
    Math.min(1, input.systems.length / 4) +
    Math.min(1, (input.citiesCount ?? 0) / 3) +
    Math.min(1, input.experienceTypesCount / 3) +
    Math.min(1, input.roles.length / 2);

  return required * 0.7 + (extras / 7) * 0.3;
}

function onlineFreshness(lastSeenAt: Date | null, updatedAt: Date, nowMs: number): number {
  const at = lastSeenAt ?? updatedAt;
  const age = Math.max(0, nowMs - at.getTime());
  if (age >= ONLINE_FLOOR_MS) {
    return 0;
  }
  const afterPlateau = Math.max(0, age - ONLINE_PLATEAU_MS);
  return Math.exp(-afterPlateau / ONLINE_HALF_LIFE_MS);
}

function rewardsScore(rewards: ReadonlyArray<{ badgeType: RewardBadgeTypeId }>): number {
  if (rewards.length === 0) {
    return 0;
  }

  const unique = new Set<RewardBadgeTypeId>();
  let weighted = 0;
  for (const reward of rewards) {
    if (unique.has(reward.badgeType)) {
      continue;
    }
    unique.add(reward.badgeType);
    weighted += BADGE_WEIGHT[reward.badgeType] ?? 1;
  }

  const maxWeight = BADGE_DISPLAY_PRIORITY.reduce(
    (sum, badge) => sum + (BADGE_WEIGHT[badge] ?? 0),
    0,
  );
  return Math.min(1, weighted / maxWeight);
}

function logCap(count: number, softCap: number): number {
  if (count <= 0 || softCap <= 0) {
    return 0;
  }
  return Math.min(1, Math.log1p(count) / Math.log1p(softCap));
}

/** Chat volume: texts + initiated calls. Dice is scored separately. */
export function chatActivityScore(messageCount = 0, callCount = 0): number {
  return logCap(messageCount, 80) * 0.56 + logCap(callCount, 8) * 0.44;
}

export function wandererFeedRankScore(input: WandererFeedRankInput, nowMs = Date.now()): number {
  const richness = questionnaireRichness(input.completion);
  const online = onlineFreshness(input.lastSeenAt, input.updatedAt, nowMs);
  const rewards = rewardsScore(input.rewards);
  const activity = chatActivityScore(input.messageCount, input.callCount);
  const dice = logCap(input.diceRollCount ?? 0, 12);
  return richness * 0.28 + online * 0.38 + rewards * 0.2 + activity * 0.1 + dice * 0.04;
}

export function compareWandererFeedRank(
  left: WandererFeedRankInput,
  right: WandererFeedRankInput,
  nowMs = Date.now(),
): number {
  const delta = wandererFeedRankScore(right, nowMs) - wandererFeedRankScore(left, nowMs);
  if (Math.abs(delta) > 1e-9) {
    return delta;
  }

  const leftSeen = (left.lastSeenAt ?? left.updatedAt).getTime();
  const rightSeen = (right.lastSeenAt ?? right.updatedAt).getTime();
  return rightSeen - leftSeen;
}
