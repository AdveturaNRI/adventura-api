export type QuestionnaireCompletionInput = {
  roles: string[];
  hasProfileCard: boolean;
  about: string | null;
  description: string | null;
  age: number | null;
  experienceTypesCount: number;
  availability: string | null;
  cityId: string | null;
  playsOnline: boolean;
  timezone: string | null;
  systems: string[];
  readyToLearnNew: boolean;
  openToAnySystem: boolean;
};

/** Only required questionnaire fields count toward completion %. */
const QUESTIONNAIRE_COMPLETION_FIELDS = [
  (input: QuestionnaireCompletionInput) => input.roles.length > 0,
  (input: QuestionnaireCompletionInput) => Boolean(input.about?.trim()),
  (input: QuestionnaireCompletionInput) =>
    input.age != null && Number.isFinite(input.age) && input.age >= 1 && input.age <= 99,
  (input: QuestionnaireCompletionInput) => input.experienceTypesCount > 0,
  (input: QuestionnaireCompletionInput) => Boolean(input.availability?.trim()),
  (input: QuestionnaireCompletionInput) => Boolean(input.timezone?.trim()),
  (input: QuestionnaireCompletionInput) => Boolean(input.cityId) || input.playsOnline,
  (input: QuestionnaireCompletionInput) =>
    input.systems.length > 0 || input.readyToLearnNew || input.openToAnySystem,
] as const;

/** Feed visibility: same as complete, but age is optional (legacy profiles without age stay visible). */
const WANDERERS_FEED_FIELDS = [
  (input: QuestionnaireCompletionInput) => input.roles.length > 0,
  (input: QuestionnaireCompletionInput) => Boolean(input.about?.trim()),
  (input: QuestionnaireCompletionInput) => input.experienceTypesCount > 0,
  (input: QuestionnaireCompletionInput) => Boolean(input.availability?.trim()),
  (input: QuestionnaireCompletionInput) => Boolean(input.timezone?.trim()),
  (input: QuestionnaireCompletionInput) => Boolean(input.cityId) || input.playsOnline,
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
    playsOnline: boolean;
    timezone?: string | null;
    systems: string[];
    readyToLearnNew: boolean;
    openToAnySystem: boolean;
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
    playsOnline: user.playsOnline,
    timezone: user.timezone ?? null,
    systems: user.systems,
    readyToLearnNew: user.readyToLearnNew,
    openToAnySystem: user.openToAnySystem,
  };
}

export function isQuestionnaireStarted(input: QuestionnaireCompletionInput): boolean {
  return calculateQuestionnaireCompletionPercent(input) > 0;
}

export function isQuestionnaireComplete(input: QuestionnaireCompletionInput): boolean {
  return calculateQuestionnaireCompletionPercent(input) === 100;
}

export function isEligibleForWanderersFeed(input: QuestionnaireCompletionInput): boolean {
  return WANDERERS_FEED_FIELDS.every((isFilled) => isFilled(input));
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
