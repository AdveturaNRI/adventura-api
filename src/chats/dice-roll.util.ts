import { randomInt } from 'crypto';

export const DICE_ROLL_PAYLOAD_VERSION = 1 as const;

export type DiceRollGroupPayload = {
  sides: number;
  values: number[];
  sum: number;
};

export type DiceRollMode = 'normal' | 'advantage' | 'disadvantage';

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
  /** Hex `#RRGGBB` цвета кубов отправителя. */
  color?: string;
  /** Эксклюзивный скин: alpha_pioneer / neon_glitch / founding_obsidian. */
  skin?: string;
  mode?: DiceRollMode;
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DICE_SKINS = new Set(['alpha_pioneer', 'neon_glitch', 'founding_obsidian']);

export function normalizeDiceColor(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const value = raw.trim();
  if (!HEX_COLOR_RE.test(value)) {
    return undefined;
  }
  return `#${value.slice(1).toUpperCase()}`;
}

export function normalizeDiceSkin(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const value = raw.trim();
  return DICE_SKINS.has(value) ? value : undefined;
}

export type DiceRollDieInput = {
  sides: number;
  qty: number;
};

const ALLOWED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);
const MAX_PER_DIE = 8;
const MAX_TOTAL = 12;

export function validateDiceRollInput(
  dice: DiceRollDieInput[],
  modifier = 0,
  mode: DiceRollMode = 'normal',
) {
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
  if (mode === 'advantage' || mode === 'disadvantage') {
    if (dice.length !== 1 || dice[0]?.sides !== 20 || dice[0]?.qty !== 2) {
      return 'Преимущество и помеха — только 2d20';
    }
  }
  return null;
}

export function formatDiceFormula(
  dice: DiceRollDieInput[],
  modifier = 0,
  mode: DiceRollMode = 'normal',
) {
  if (mode === 'advantage' || mode === 'disadvantage') {
    const base = '1d20';
    if (modifier === 0) {
      return base;
    }
    return modifier > 0 ? `${base} + ${modifier}` : `${base} − ${Math.abs(modifier)}`;
  }

  const parts = [...dice]
    .sort((a, b) => a.sides - b.sides)
    .map((die) => `${die.qty}d${die.sides}`);
  let base = parts.join(' + ');
  if (modifier === 0) {
    return base;
  }
  return modifier > 0 ? `${base} + ${modifier}` : `${base} − ${Math.abs(modifier)}`;
}

function normalizeMode(mode: DiceRollMode | null | undefined): DiceRollMode {
  return mode === 'advantage' || mode === 'disadvantage' ? mode : 'normal';
}

function collectD20Values(groups: { sides: number; values: number[] }[]): number[] {
  return groups.filter((item) => item.sides === 20).flatMap((item) => item.values);
}

function totalFromGroups(
  groups: DiceRollGroupPayload[],
  values: number[],
  modifier: number,
  mode: DiceRollMode,
): { groups: DiceRollGroupPayload[]; sum: number } {
  if (mode === 'advantage' || mode === 'disadvantage') {
    const d20Values = collectD20Values(groups);
    if (d20Values.length >= 2) {
      const kept =
        mode === 'advantage' ? Math.max(...d20Values) : Math.min(...d20Values);
      const otherGroups = groups.filter((item) => item.sides !== 20);
      return {
        groups: [
          ...otherGroups,
          {
            sides: 20,
            values: d20Values,
            sum: kept,
          },
        ],
        sum: kept + modifier,
      };
    }
  }
  return {
    groups,
    sum: values.reduce((a, b) => a + b, 0) + modifier,
  };
}

export type DiceRollClientGroupInput = {
  sides: number;
  values: number[];
};

/** Собрать payload из клиентского броска (фронт — источник истины). */
export function buildDicePayloadFromClient(
  dice: DiceRollDieInput[],
  groupsInput: DiceRollClientGroupInput[],
  modifier = 0,
  color?: string,
  mode: DiceRollMode = 'normal',
  skin?: string,
): DiceRollPayload | string {
  const resolvedMode = normalizeMode(mode);
  const expected = [...dice].sort((a, b) => a.sides - b.sides);
  if (!Array.isArray(groupsInput) || groupsInput.length !== expected.length) {
    return 'Раскладка кубов не совпадает с формулой';
  }

  const groups: DiceRollGroupPayload[] = [];
  const values: number[] = [];

  for (let i = 0; i < expected.length; i += 1) {
    const die = expected[i];
    const group = groupsInput[i];
    if (!group || group.sides !== die.sides) {
      return 'Тип кубика в раскладке не совпадает';
    }
    if (!Array.isArray(group.values) || group.values.length !== die.qty) {
      return 'Число граней в раскладке не совпадает';
    }
    const rolled: number[] = [];
    for (const raw of group.values) {
      if (!Number.isInteger(raw) || raw < 1 || raw > die.sides) {
        return `Значение кубика d${die.sides} вне диапазона`;
      }
      rolled.push(raw);
      values.push(raw);
    }
    groups.push({
      sides: die.sides,
      values: rolled,
      sum: rolled.reduce((a, b) => a + b, 0),
    });
  }

  const resolved = totalFromGroups(groups, values, modifier, resolvedMode);
  const normalizedColor = normalizeDiceColor(color);
  const normalizedSkin = normalizeDiceSkin(skin);
  return {
    v: DICE_ROLL_PAYLOAD_VERSION,
    formula: formatDiceFormula(dice, modifier, resolvedMode),
    modifier,
    groups: resolved.groups,
    values,
    sum: resolved.sum,
    hidden: false,
    ...(normalizedColor ? { color: normalizedColor } : {}),
    ...(normalizedSkin ? { skin: normalizedSkin } : {}),
    ...(resolvedMode !== 'normal' ? { mode: resolvedMode } : {}),
  };
}

/** Fallback, если клиент не прислал раскладку (старые клиенты). */
export function rollDiceServerSide(
  dice: DiceRollDieInput[],
  modifier = 0,
  color?: string,
  mode: DiceRollMode = 'normal',
  skin?: string,
): DiceRollPayload {
  const resolvedMode = normalizeMode(mode);
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

  const resolved = totalFromGroups(groups, values, modifier, resolvedMode);
  const normalizedColor = normalizeDiceColor(color);
  const normalizedSkin = normalizeDiceSkin(skin);
  return {
    v: DICE_ROLL_PAYLOAD_VERSION,
    formula: formatDiceFormula(dice, modifier, resolvedMode),
    modifier,
    groups: resolved.groups,
    values,
    sum: resolved.sum,
    hidden: false,
    ...(normalizedColor ? { color: normalizedColor } : {}),
    ...(normalizedSkin ? { skin: normalizedSkin } : {}),
    ...(resolvedMode !== 'normal' ? { mode: resolvedMode } : {}),
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
    const color = normalizeDiceColor(parsed.color);
    const skin = normalizeDiceSkin(parsed.skin);
    const mode = normalizeMode(parsed.mode);
    return {
      v: DICE_ROLL_PAYLOAD_VERSION,
      formula: parsed.formula,
      modifier: typeof parsed.modifier === 'number' ? parsed.modifier : 0,
      groups: Array.isArray(parsed.groups) ? (parsed.groups as DiceRollGroupPayload[]) : [],
      values: Array.isArray(parsed.values) ? (parsed.values as number[]) : [],
      sum: typeof parsed.sum === 'number' ? parsed.sum : null,
      hidden: Boolean(parsed.hidden),
      redacted: Boolean(parsed.redacted),
      ...(color ? { color } : {}),
      ...(skin ? { skin } : {}),
      ...(mode !== 'normal' ? { mode } : {}),
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
    ...(payload.color ? { color: payload.color } : {}),
    ...(payload.skin ? { skin: payload.skin } : {}),
    ...(payload.mode && payload.mode !== 'normal' ? { mode: payload.mode } : {}),
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
