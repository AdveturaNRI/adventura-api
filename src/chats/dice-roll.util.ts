import { randomInt } from 'crypto';

export const DICE_ROLL_PAYLOAD_VERSION = 1 as const;

export type DiceRollGroupPayload = {
  sides: number;
  values: number[];
  sum: number;
};

export type DiceRollPayload = {
  v: typeof DICE_ROLL_PAYLOAD_VERSION;
  formula: string;
  modifier: number;
  groups: DiceRollGroupPayload[];
  values: number[];
  /** Итог с учётом модификатора. null если скрыто от зрителя. */
  sum: number | null;
  hidden: boolean;
  redacted?: boolean;
};

export type DiceRollDieInput = {
  sides: number;
  qty: number;
};

const ALLOWED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);
const MAX_PER_DIE = 8;
const MAX_TOTAL = 12;

export function validateDiceRollInput(dice: DiceRollDieInput[], modifier = 0) {
  if (!Array.isArray(dice) || dice.length === 0) {
    return 'Выберите хотя бы один кубик';
  }
  let total = 0;
  for (const die of dice) {
    if (!ALLOWED_SIDES.has(die.sides)) {
      return 'Недопустимый тип кубика';
    }
    if (!Number.isInteger(die.qty) || die.qty < 1 || die.qty > MAX_PER_DIE) {
      return `На один тип — от 1 до ${MAX_PER_DIE} кубиков`;
    }
    total += die.qty;
  }
  if (total > MAX_TOTAL) {
    return `За раз не больше ${MAX_TOTAL} кубиков`;
  }
  if (!Number.isInteger(modifier) || modifier < -99 || modifier > 99) {
    return 'Модификатор от −99 до 99';
  }
  return null;
}

export function formatDiceFormula(dice: DiceRollDieInput[], modifier = 0) {
  const parts = [...dice]
    .sort((a, b) => a.sides - b.sides)
    .map((die) => `${die.qty}d${die.sides}`);
  const base = parts.join(' + ');
  if (modifier === 0) {
    return base;
  }
  return modifier > 0 ? `${base} + ${modifier}` : `${base} − ${Math.abs(modifier)}`;
}

export function rollDiceServerSide(
  dice: DiceRollDieInput[],
  modifier = 0,
): DiceRollPayload {
  const groups: DiceRollGroupPayload[] = [];
  const values: number[] = [];

  for (const die of [...dice].sort((a, b) => a.sides - b.sides)) {
    const rolled: number[] = [];
    for (let i = 0; i < die.qty; i += 1) {
      const value = randomInt(1, die.sides + 1);
      rolled.push(value);
      values.push(value);
    }
    groups.push({
      sides: die.sides,
      values: rolled,
      sum: rolled.reduce((a, b) => a + b, 0),
    });
  }

  const diceSum = values.reduce((a, b) => a + b, 0);
  return {
    v: DICE_ROLL_PAYLOAD_VERSION,
    formula: formatDiceFormula(dice, modifier),
    modifier,
    groups,
    values,
    sum: diceSum + modifier,
    hidden: false,
  };
}

export function serializeDiceRollPayload(payload: DiceRollPayload): string {
  return JSON.stringify(payload);
}

export function parseDiceRollPayload(body: string | null | undefined): DiceRollPayload | null {
  if (!body?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as Partial<DiceRollPayload>;
    if (parsed?.v !== DICE_ROLL_PAYLOAD_VERSION || typeof parsed.formula !== 'string') {
      return null;
    }
    return {
      v: DICE_ROLL_PAYLOAD_VERSION,
      formula: parsed.formula,
      modifier: typeof parsed.modifier === 'number' ? parsed.modifier : 0,
      groups: Array.isArray(parsed.groups) ? (parsed.groups as DiceRollGroupPayload[]) : [],
      values: Array.isArray(parsed.values) ? (parsed.values as number[]) : [],
      sum: typeof parsed.sum === 'number' ? parsed.sum : null,
      hidden: Boolean(parsed.hidden),
      redacted: Boolean(parsed.redacted),
    };
  } catch {
    return null;
  }
}

/** Для чужих глаз скрытый бросок — без раскладки и суммы. */
export function redactDiceRollPayload(payload: DiceRollPayload): DiceRollPayload {
  return {
    v: DICE_ROLL_PAYLOAD_VERSION,
    formula: payload.formula,
    modifier: payload.modifier,
    groups: [],
    values: [],
    sum: null,
    hidden: true,
    redacted: true,
  };
}

export function diceRollPreviewText(
  payload: DiceRollPayload | null,
  options?: { isSender?: boolean },
): string {
  if (!payload) {
    return 'Бросок костей';
  }
  if (payload.hidden && (payload.redacted || !options?.isSender)) {
    return `Скрытый бросок · ${payload.formula}`;
  }
  if (typeof payload.sum === 'number') {
    return `🎲 ${payload.formula} = ${payload.sum}`;
  }
  return `🎲 ${payload.formula}`;
}
