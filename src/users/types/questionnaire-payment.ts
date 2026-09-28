export const GAME_COST_FORMATS = ['free', 'paid', 'both'] as const;
export const SESSION_PRICE_KINDS = ['fixed', 'from', 'range'] as const;
export const PLAYER_PAYMENT_FORMATS = ['free_only', 'free_and_paid'] as const;

export type GameCostFormat = (typeof GAME_COST_FORMATS)[number];
export type SessionPriceKind = (typeof SESSION_PRICE_KINDS)[number];
export type PlayerPaymentFormat = (typeof PLAYER_PAYMENT_FORMATS)[number];

export const SESSION_PRICE_MIN = 1;
export const SESSION_PRICE_MAX = 1_000_000;

export type QuestionnairePaymentFields = {
  gameCostFormat: GameCostFormat | null;
  sessionPriceKind: SessionPriceKind | null;
  sessionPriceMin: number | null;
  sessionPriceMax: number | null;
  playerPaymentFormat: PlayerPaymentFormat | null;
  playerBudgetKind: SessionPriceKind | null;
  playerBudgetMin: number | null;
  playerBudgetMax: number | null;
};

export class QuestionnairePaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionnairePaymentError';
  }
}

function isPositivePrice(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= SESSION_PRICE_MIN;
}

function normalizePriceTriple(input: {
  kind?: SessionPriceKind | null;
  min?: number | null;
  max?: number | null;
}): {
  kind: SessionPriceKind | null;
  min: number | null;
  max: number | null;
} {
  const min = isPositivePrice(input.min) ? input.min : null;
  const max = isPositivePrice(input.max) ? input.max : null;
  let kind = input.kind ?? null;

  if (min == null && max == null) {
    return { kind: null, min: null, max: null };
  }

  if (kind === 'range' || (kind == null && min != null && max != null)) {
    if (min == null || max == null) {
      throw new QuestionnairePaymentError('Укажите обе границы диапазона стоимости');
    }

    if (min > max) {
      throw new QuestionnairePaymentError(
        'Минимальная стоимость не может быть больше максимальной',
      );
    }

    return { kind: 'range', min, max };
  }

  const value = min ?? max;

  if (value == null) {
    return { kind: null, min: null, max: null };
  }

  return {
    kind: kind === 'from' ? 'from' : 'fixed',
    min: value,
    max: null,
  };
}

export function normalizeQuestionnairePayment(input: {
  gameCostFormat?: GameCostFormat | null;
  sessionPriceKind?: SessionPriceKind | null;
  sessionPriceMin?: number | null;
  sessionPriceMax?: number | null;
  playerPaymentFormat?: PlayerPaymentFormat | null;
  playerBudgetKind?: SessionPriceKind | null;
  playerBudgetMin?: number | null;
  playerBudgetMax?: number | null;
}): QuestionnairePaymentFields {
  const gameCostFormat = input.gameCostFormat ?? null;
  const playerPaymentFormat = input.playerPaymentFormat ?? null;

  const sessionPrice =
    gameCostFormat === 'paid' || gameCostFormat === 'both'
      ? normalizePriceTriple({
          kind: input.sessionPriceKind,
          min: input.sessionPriceMin,
          max: input.sessionPriceMax,
        })
      : { kind: null, min: null, max: null };

  const playerBudget =
    playerPaymentFormat === 'free_and_paid'
      ? normalizePriceTriple({
          kind: input.playerBudgetKind,
          min: input.playerBudgetMin,
          max: input.playerBudgetMax,
        })
      : { kind: null, min: null, max: null };

  return {
    gameCostFormat,
    sessionPriceKind: sessionPrice.kind,
    sessionPriceMin: sessionPrice.min,
    sessionPriceMax: sessionPrice.max,
    playerPaymentFormat,
    playerBudgetKind: playerBudget.kind,
    playerBudgetMin: playerBudget.min,
    playerBudgetMax: playerBudget.max,
  };
}
