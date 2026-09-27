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
      }),
    ).toEqual({
      gameCostFormat: null,
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat: null,
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
      }),
    ).toEqual({
      gameCostFormat: 'free',
      sessionPriceKind: null,
      sessionPriceMin: null,
      sessionPriceMax: null,
      playerPaymentFormat: 'free_only',
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
