export type QuestionnaireCompletionInput = {
  roles: string[];
  hasProfileCard: boolean;
  about: string | null;
  description: string | null;
  age: number | null;
  experienceTypesCount: number;
  availability: string | null;
  cityId: string | null;
  citiesCount?: number;
  playsOnline: boolean;
  timezone: string | null;
  systems: string[];
  readyToLearnNew: boolean;
  openToAnySystem: boolean;
  gameCostFormat?: string | null;
  playerPaymentFormat?: string | null;
};

function hasLocation(input: QuestionnaireCompletionInput): boolean {
  return Boolean(input.cityId) || (input.citiesCount ?? 0) > 0 || input.playsOnline;
}

function hasMasterRole(roles: string[]): boolean {
  return roles.includes('Мастер');
}

function hasPlayerRole(roles: string[]): boolean {
  return roles.includes('Игрок');
}

function hasGameCost(input: QuestionnaireCompletionInput): boolean {
  return !hasMasterRole(input.roles) || Boolean(input.gameCostFormat);
}

function hasPlayerPayment(input: QuestionnaireCompletionInput): boolean {
  return !hasPlayerRole(input.roles) || Boolean(input.playerPaymentFormat);
}

/** Only required questionnaire fields count toward completion %. */
const QUESTIONNAIRE_COMPLETION_FIELDS = [
  (input: QuestionnaireCompletionInput) => input.roles.length > 0,
  hasGameCost,
  hasPlayerPayment,
  (input: QuestionnaireCompletionInput) =>
    input.age != null && Number.isFinite(input.age) && input.age >= 1 && input.age <= 99,
  (input: QuestionnaireCompletionInput) => input.experienceTypesCount > 0,
  (input: QuestionnaireCompletionInput) => Boolean(input.availability?.trim()),
  (input: QuestionnaireCompletionInput) => Boolean(input.timezone?.trim()),
  hasLocation,
  (input: QuestionnaireCompletionInput) =>
    input.systems.length > 0 || input.readyToLearnNew || input.openToAnySystem,
] as const;

export function buildQuestionnaireCompletionInput(
  user: {
    roles: string[];
    about: string | null;
    description: string | null;
    age: number | null;
    experiences: readonly unknown[];
    availability: string | null;
    cityId: string | null;
    userCities?: readonly unknown[];
    playsOnline: boolean;
    timezone?: string | null;
    systems: string[];
    readyToLearnNew: boolean;
    openToAnySystem: boolean;
    gameCostFormat?: string | null;
    playerPaymentFormat?: string | null;
  },
  hasProfileCard: boolean,
): QuestionnaireCompletionInput {
  return {
    roles: user.roles,
    hasProfileCard,
    about: user.about,
    description: user.description,
    age: user.age,
    experienceTypesCount: user.experiences.length,
    availability: user.availability,
    cityId: user.cityId,
    citiesCount: user.userCities?.length ?? 0,
    playsOnline: user.playsOnline,
    timezone: user.timezone ?? null,
    systems: user.systems,
    readyToLearnNew: user.readyToLearnNew,
    openToAnySystem: user.openToAnySystem,
    gameCostFormat: user.gameCostFormat ?? null,
    playerPaymentFormat: user.playerPaymentFormat ?? null,
  };
}

export function isQuestionnaireStarted(input: QuestionnaireCompletionInput): boolean {
  return calculateQuestionnaireCompletionPercent(input) > 0;
}

export function isQuestionnaireComplete(input: QuestionnaireCompletionInput): boolean {
  return calculateQuestionnaireCompletionPercent(input) === 100;
}

/** Public profiles stay in the feed even if required questionnaire fields are still empty. */
export function isEligibleForWanderersFeed(
  _input: QuestionnaireCompletionInput,
): boolean {
  return true;
}

export function calculateQuestionnaireCompletionPercent(
  input: QuestionnaireCompletionInput,
): number {
  const filledCount = QUESTIONNAIRE_COMPLETION_FIELDS.reduce(
    (count, isFilled) => count + (isFilled(input) ? 1 : 0),
    0,
  );

  return Math.round((filledCount / QUESTIONNAIRE_COMPLETION_FIELDS.length) * 100);
}
