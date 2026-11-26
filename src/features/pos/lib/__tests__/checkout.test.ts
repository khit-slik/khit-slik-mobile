import type { PosProduct } from '../../../../services/pos/types';
import {
  buildCreateOrderPayload,
  CheckoutInput,
  getFinalPaidAmount,
  getInitialPaidAmount,
  getTodayDateString,
  validateCheckout,
} from '../checkout';
import { fromApiPaymentMethod, PAYMENT_METHODS, PaymentMethod, toApiPaymentMethod } from '../paymentMethods';
import { computeTotals } from '../pricing';

const product: PosProduct = { _id: 'inv1', productName: 'Oil', sellingPrice: 1000, availableQuantity: 10 };
const items = [{ product, qty: 3 }];
const totals = computeTotals({ items, priceMode: 'normal', discountPercent: 0, markupAmount: 0 }); // 3000

const input = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  items,
  totals,
  paymentMode: 'cod',
  paymentType: 'paid',
  paymentMethod: PAYMENT_METHODS.COD,
  paidAmount: 3000,
  creditPersonId: 'cp1',
  deliveryRegion: '',
  deliveryTownship: '',
  note: '',
  orderDate: '2026-10-23',
  ...overrides,
});

describe('validateCheckout', () => {
  it('needs something in the cart', () => {
    expect(validateCheckout(input({ items: [] }))).toBe('EMPTY_CART');
  });

  it('requires a customer before saving any regular order', () => {
    expect(validateCheckout(input({ creditPersonId: '' }))).toBe('CUSTOMER_REQUIRED');
    expect(validateCheckout(input({ creditPersonId: '  ' }))).toBe('CUSTOMER_REQUIRED');
  });

  it('requires selecting a payment mode when none is picked', () => {
    expect(validateCheckout(input({ paymentMode: null, paymentMethod: PAYMENT_METHODS.CASH, paymentType: 'paid' }))).toBe(
      'PAYMENT_MODE_REQUIRED',
    );
  });

  it('allows COD in Yangon or unspecified region and rejects COD outside Yangon', () => {
    expect(validateCheckout(input({ paymentMode: 'cod', deliveryRegion: '' }))).toBeNull();
    expect(validateCheckout(input({ paymentMode: 'cod', deliveryRegion: 'yangon' }))).toBeNull();
    expect(validateCheckout(input({ paymentMode: 'cod', deliveryRegion: 'mandalay' }))).toBe('COD_REGION_INVALID');
  });

  it('Cashdown requires full payment including delivery fee', () => {
    const cashdown = {
      paymentMode: 'cashdown' as const,
      paymentType: 'credit' as const,
      paymentMethod: PAYMENT_METHODS.KBZ_PAY,
      deliveryRegion: 'mandalay',
    };
    expect(validateCheckout(input({ ...cashdown, paidAmount: 2999 }))).toBe('CASHDOWN_FULL_PAYMENT_REQUIRED');
    expect(validateCheckout(input({ ...cashdown, paidAmount: 3000 }))).toBeNull();
    expect(validateCheckout(input({ ...cashdown, paidAmount: 3500 }))).toBeNull();
  });

  it('FOC needs a customer and zero payment', () => {
    expect(validateCheckout(input({ paymentMode: 'foc', paymentMethod: PAYMENT_METHODS.FOC, paidAmount: 0 }))).toBeNull();
  });

  it('reports the first problem first', () => {
    expect(validateCheckout(input({ items: [], creditPersonId: '' }))).toBe('EMPTY_CART');
  });
});

describe('paid amounts', () => {
  it('computes final paid amount by mode: COD full total (Option B), FOC 0, Cashdown paidAmount', () => {
    expect(getFinalPaidAmount(PAYMENT_METHODS.FOC, 3000, 3000, 'foc')).toBe(0);
    expect(getFinalPaidAmount(PAYMENT_METHODS.COD, 0, 3500, 'cod')).toBe(3500);
    expect(getFinalPaidAmount(PAYMENT_METHODS.KBZ_PAY, 3500, 3500, 'cashdown')).toBe(3500);
  });

  it('prefills the checkout screen', () => {
    expect(
      getInitialPaidAmount({ paymentMode: 'cod', paymentType: 'paid', paymentMethod: PAYMENT_METHODS.COD, paidAmount: 0, total: 2699.4 }),
    ).toBe(2700);
    expect(
      getInitialPaidAmount({ paymentMode: 'foc', paymentType: 'paid', paymentMethod: PAYMENT_METHODS.FOC, paidAmount: 3000, total: 3000 }),
    ).toBe(0);
    expect(
      getInitialPaidAmount({ paymentMode: 'cashdown', paymentType: 'credit', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paidAmount: 0, total: 3000 }),
    ).toBe(3000);
  });
});

describe('buildCreateOrderPayload', () => {
  it('builds the POST /order body for Cashdown (KPay + credit category)', () => {
    expect(
      buildCreateOrderPayload(
        input({
          note: 'urgent',
          paymentMode: 'cashdown',
          paymentType: 'credit',
          paymentMethod: PAYMENT_METHODS.KBZ_PAY,
          paidAmount: 3000,
        }),
      ),
    ).toEqual({
      ordersProducts: [{ inventoryId: 'inv1', quantity: 3 }],
      subTotal: 3000,
      discount: 0,
      finalAmount: 3000,
      deliveryRegion: null,
      deliveryTownship: null,
      deliveryFee: 0,
      paidAmount: 3000,
      paymentMode: 'cashdown',
      paymentType: 'credit',
      note: 'urgent',
      paymentMethod: 'kpay',
      orderDate: '2026-10-23T00:00:00.000Z',
      creditPersonId: 'cp1',
    });
  });

  it('builds the POST /order body for COD (Option B paid + full amount)', () => {
    expect(buildCreateOrderPayload(input({ paymentMode: 'cod', paidAmount: 0 }))).toMatchObject({
      paymentMode: 'cod',
      paymentType: 'paid',
      paymentMethod: 'cod',
      paidAmount: 3000,
      creditPersonId: 'cp1',
    });
  });

  it('sends discounts as an amount', () => {
    const discounted = computeTotals({ items, priceMode: 'discount', discountPercent: 10, markupAmount: 0 });
    expect(buildCreateOrderPayload(input({ totals: discounted, paidAmount: 2700 }))).toMatchObject({
      subTotal: 3000,
      discount: 300,
      finalAmount: 2700,
      paidAmount: 2700,
    });
  });

  it('sends the region, Yangon township, and delivery fee independently of merchandise price', () => {
    const totalsWithDelivery = computeTotals({
      items,
      priceMode: 'discount',
      discountPercent: 10,
      markupAmount: 0,
      deliveryFee: 500,
    });
    const checkout = input({
      totals: totalsWithDelivery,
      paymentMode: 'cashdown',
      paymentMethod: PAYMENT_METHODS.KBZ_PAY,
      paymentType: 'credit',
      paidAmount: 3200,
      deliveryRegion: 'mandalay',
      deliveryTownship: 'ygn-hlaing',
    });

    expect(validateCheckout(checkout)).toBeNull();
    expect(validateCheckout({ ...checkout, paidAmount: 2700 })).toBe('CASHDOWN_FULL_PAYMENT_REQUIRED');
    expect(buildCreateOrderPayload(checkout)).toMatchObject({
      subTotal: 3000,
      discount: 300,
      deliveryRegion: 'mandalay',
      deliveryTownship: null,
      deliveryFee: 500,
      finalAmount: 3200,
      paidAmount: 3200,
    });
  });

  it('FOC sends a paid amount of 0', () => {
    expect(
      buildCreateOrderPayload(input({ paymentMode: 'foc', paymentMethod: PAYMENT_METHODS.FOC, paidAmount: 3000 })),
    ).toMatchObject({ paidAmount: 0, paymentMethod: 'foc', paymentMode: 'foc', paymentType: 'paid' });
  });
});

describe('getTodayDateString', () => {
  it('uses the local calendar day', () => {
    expect(getTodayDateString(new Date(2026, 0, 5, 1, 30))).toBe('2026-01-05');
    expect(getTodayDateString(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});

describe('payment methods', () => {
  it('maps to the API values the backend accepts', () => {
    expect(toApiPaymentMethod(PAYMENT_METHODS.CASH)).toBe('cash');
    expect(toApiPaymentMethod(PAYMENT_METHODS.KBZ_PAY)).toBe('kpay');
    expect(toApiPaymentMethod(PAYMENT_METHODS.MMQR)).toBe('MMQR');
    expect(toApiPaymentMethod(PAYMENT_METHODS.BANK_TRANSFER)).toBe('bank_transfer');
    expect(toApiPaymentMethod(PAYMENT_METHODS.FOC)).toBe('foc');
  });

  it('round-trips every method', () => {
    for (const method of Object.values(PAYMENT_METHODS) as PaymentMethod[]) {
      expect(fromApiPaymentMethod(toApiPaymentMethod(method))).toBe(method);
    }
  });

  it('falls back to cash for unknown values', () => {
    expect(fromApiPaymentMethod('bitcoin')).toBe(PAYMENT_METHODS.CASH);
    expect(fromApiPaymentMethod(undefined)).toBe(PAYMENT_METHODS.CASH);
  });
});
