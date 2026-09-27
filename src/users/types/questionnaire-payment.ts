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

export function normalizeQuestionnairePayment(input: {
  gameCostFormat?: GameCostFormat | null;
  sessionPriceKind?: SessionPriceKind | null;
  sessionPriceMin?: number | null;
  sessionPriceMax?: number | null;
  playerPaymentFormat?: PlayerPaymentFormat | null;
}): QuestionnairePaymentFields {
  const gameCostFormat = input.gameCostFormat ?? null;
  const playerPaymentFormat = input.playerPaymentFormat ?? null;

  if (gameCostFormat !== 'paid' && gameCostFormat !== 'both') {
    return {
      gameCostFormat,
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat,
    };
  }

  const min = isPositivePrice(input.sessionPriceMin) ? input.sessionPriceMin : null;
  const max = isPositivePrice(input.sessionPriceMax) ? input.sessionPriceMax : null;
  let kind = input.sessionPriceKind ?? null;

  if (min == null && max == null) {
    return {
      gameCostFormat,
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat,
    };
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

    return {
      gameCostFormat,
      sessionPriceKind: 'range',
      sessionPriceMin: min,
      sessionPriceMax: max,
      playerPaymentFormat,
    };
  }

  const value = min ?? max;

  if (value == null) {
    return {
      gameCostFormat,
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat,
    };
  }

  return {
    gameCostFormat,
    sessionPriceKind: kind === 'from' ? 'from' : 'fixed',
    sessionPriceMin: value,
    sessionPriceMax: null,
    playerPaymentFormat,
  };
}
