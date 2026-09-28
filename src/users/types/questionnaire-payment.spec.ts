import {
  QuestionnairePaymentError,
  normalizeQuestionnairePayment,
} from './questionnaire-payment';

describe('normalizeQuestionnairePayment', () => {
  it('keeps unspecified format empty instead of treating it as free', () => {
    expect(
      normalizeQuestionnairePayment({
        gameCostFormat: null,
        sessionPriceKind: 'fixed',
        sessionPriceMin: 1500,
        sessionPriceMax: null,
        playerPaymentFormat: null,
        playerBudgetKind: 'fixed',
        playerBudgetMin: 500,
        playerBudgetMax: null,
      }),
    ).toEqual({
      gameCostFormat: null,
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat: null,
      playerBudgetKind: null,
      playerBudgetMin: null,
      playerBudgetMax: null,
    });
  });

  it('clears session price when games are free', () => {
    expect(
      normalizeQuestionnairePayment({
        gameCostFormat: 'free',
        sessionPriceKind: 'from',
        sessionPriceMin: 1500,
        sessionPriceMax: 2500,
        playerPaymentFormat: 'free_only',
        playerBudgetKind: 'fixed',
        playerBudgetMin: 500,
        playerBudgetMax: null,
      }),
    ).toEqual({
      gameCostFormat: 'free',
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat: 'free_only',
      playerBudgetKind: null,
      playerBudgetMin: null,
      playerBudgetMax: null,
    });
  });

  it('keeps paid games without a session price', () => {
    expect(
      normalizeQuestionnairePayment({
        gameCostFormat: 'paid',
        sessionPriceKind: null,
        sessionPriceMin: null,
        sessionPriceMax: null,
        playerPaymentFormat: 'free_and_paid',
      }),
    ).toEqual({
      gameCostFormat: 'paid',
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat: 'free_and_paid',
      playerBudgetKind: null,
      playerBudgetMin: null,
      playerBudgetMax: null,
    });
  });

  it('stores player budget when free_and_paid and clears it otherwise', () => {
    expect(
      normalizeQuestionnairePayment({
        gameCostFormat: null,
        playerPaymentFormat: 'free_and_paid',
        playerBudgetKind: 'range',
        playerBudgetMin: 500,
        playerBudgetMax: 2000,
      }),
    ).toEqual({
      gameCostFormat: null,
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat: 'free_and_paid',
      playerBudgetKind: 'range',
      playerBudgetMin: 500,
      playerBudgetMax: 2000,
    });

    expect(
      normalizeQuestionnairePayment({
        gameCostFormat: null,
        playerPaymentFormat: 'free_only',
        playerBudgetKind: 'range',
        playerBudgetMin: 500,
        playerBudgetMax: 2000,
      }),
    ).toEqual({
      gameCostFormat: null,
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat: 'free_only',
      playerBudgetKind: null,
      playerBudgetMin: null,
      playerBudgetMax: null,
    });
  });

  it('stores a range and rejects min greater than max', () => {
    expect(
      normalizeQuestionnairePayment({
        gameCostFormat: 'both',
        sessionPriceKind: 'range',
        sessionPriceMin: 1500,
        sessionPriceMax: 2500,
        playerPaymentFormat: null,
      }),
    ).toEqual({
      gameCostFormat: 'both',
      sessionPriceKind: 'range',
      sessionPriceMin: 1500,
      sessionPriceMax: 2500,
      playerPaymentFormat: null,
      playerBudgetKind: null,
      playerBudgetMin: null,
      playerBudgetMax: null,
    });

    expect(() =>
      normalizeQuestionnairePayment({
        gameCostFormat: 'paid',
        sessionPriceKind: 'range',
        sessionPriceMin: 2500,
        sessionPriceMax: 1500,
        playerPaymentFormat: null,
      }),
    ).toThrow(QuestionnairePaymentError);
  });
});
