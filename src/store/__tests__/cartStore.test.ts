import type { PosProduct } from '../../services/pos/types';
import { PAYMENT_METHODS } from '../../features/pos/lib';
import { useCartStore } from '../cartStore';

const oil: PosProduct = { _id: 'oil', productName: 'Oil', sellingPrice: 1000, availableQuantity: 5 };
const filter: PosProduct = { _id: 'filter', productName: 'Filter', sellingPrice: 333, availableQuantity: 0 };

const store = () => useCartStore.getState();

// subtotal 3000
const fillCart = () => {
  store().addProduct(oil);
  store().addProduct(oil);
  store().addProduct(oil);
};

beforeEach(() => {
  store().reset();
});

describe('cart actions', () => {
  it('returns the problem to show', () => {
    expect(store().addProduct(oil)).toBeUndefined();
    expect(store().addProduct(filter)).toBe('OUT_OF_STOCK');
    expect(store().setQty('oil', 9)).toBe('EXCEEDS_STOCK');
    expect(store().items[0].qty).toBe(5);
    expect(store().changeQty('oil', 1)).toBe('EXCEEDS_STOCK');
  });

  it('removing the last item closes checkout', () => {
    fillCart();
    store().openCheckout();
    store().removeItem('oil');
    expect(store().items).toEqual([]);
    expect(store().isCheckoutOpen).toBe(false);
  });

  it('clearing the cart keeps the payment options', () => {
    fillCart();
    store().selectPaymentOption('credit');
    store().setCustomer({ _id: 'cp1' });
    store().clearItems();
    expect(store().items).toEqual([]);
    expect(store()).toMatchObject({ paymentType: 'credit', creditPersonId: 'cp1', isCheckoutOpen: false });
  });

  it('cannot open checkout with an empty cart', () => {
    store().openCheckout();
    expect(store().isCheckoutOpen).toBe(false);
  });
});

describe('checkout delivery', () => {
  it('fills the saved location for the selected customer without changing the fee', () => {
    store().setDeliveryFee(500);
    store().setCustomer({ _id: 'cp1', region: 'yangon', township: 'hlaing' });
    expect(store()).toMatchObject({
      creditPersonId: 'cp1',
      deliveryRegion: 'yangon',
      deliveryTownship: 'hlaing',
      deliveryFee: 500,
    });

    store().setCustomer({ _id: 'cp2' });
    expect(store()).toMatchObject({ deliveryRegion: '', deliveryTownship: '', deliveryFee: 500 });
  });

  it('defaults a new Yangon customer to COD credit and keeps a Cash Down override', () => {
    fillCart();
    store().openCheckout();
    const customer = { _id: 'yangon-customer', region: 'yangon' };
    store().setCustomer(customer);
    store().setDeliveryFee(500);
    expect(store()).toMatchObject({ paymentMethod: PAYMENT_METHODS.COD, paymentType: 'credit', paidAmount: 0 });

    store().setPaymentMethod(PAYMENT_METHODS.KBZ_PAY);
    expect(store().paymentMethod).toBe(PAYMENT_METHODS.COD);
    store().selectPaymentForm('cash_down');
    expect(store()).toMatchObject({ paymentMethod: PAYMENT_METHODS.CASH, paymentType: 'paid', paidAmount: 3500 });

    store().setPaymentMethod(PAYMENT_METHODS.KBZ_PAY);
    store().setCustomer(customer);
    expect(store()).toMatchObject({ paymentMethod: PAYMENT_METHODS.KBZ_PAY, paidAmount: 3500 });

    store().setCustomer({ _id: 'another-yangon-customer', region: 'yangon' });
    expect(store()).toMatchObject({ paymentMethod: PAYMENT_METHODS.COD, paidAmount: 0 });
    store().setCustomer({ _id: 'mandalay-customer', region: 'mandalay' });
    expect(store()).toMatchObject({ paymentMethod: PAYMENT_METHODS.CASH, paymentType: 'paid', paidAmount: 3500 });
    store().selectPaymentForm('cod');
    expect(store()).toMatchObject({ paymentMethod: PAYMENT_METHODS.COD, paymentType: 'credit', paidAmount: 0 });
  });

  it('retains a credit or FOC selection when a Yangon customer is selected', () => {
    for (const option of ['credit', 'foc'] as const) {
      store().reset();
      store().selectPaymentOption(option);
      store().setCustomer({ _id: 'yangon-customer', region: 'yangon' });
      expect(store().paymentMethod).toBe(option === 'credit' ? PAYMENT_METHODS.CASH : PAYMENT_METHODS.FOC);
      expect(store().paidAmount).toBe(0);
    }
  });

  it('keeps a manual region when the same customer is reselected', () => {
    const customer = { _id: 'cp1', region: 'yangon', township: 'hlaing' };
    store().setCustomer(customer);
    store().setDeliveryRegion('mandalay');
    store().setCustomer(customer);
    expect(store()).toMatchObject({ deliveryRegion: 'mandalay', deliveryTownship: '' });
  });

  it('updates the paid total and resets delivery after a new sale', () => {
    fillCart();
    store().openCheckout();
    store().setDeliveryRegion('mandalay');
    store().setDeliveryFee(500);
    expect(store().paidAmount).toBe(3500);

    const sale = store().completeSale({ _id: 'o1', orderNumber: 'INV/0001' }, null);
    expect(sale.totals).toMatchObject({ subtotal: 3000, deliveryFee: 500, total: 3500 });
    expect(store()).toMatchObject({ deliveryRegion: '', deliveryTownship: '', deliveryFee: 0 });
  });
});

describe('price mode', () => {
  it('switching mode clears the other mode’s value', () => {
    fillCart();
    store().setPriceMode('discount');
    store().setDiscountPercent(10);
    store().setPriceMode('markup');
    expect(store().discountPercent).toBe(0);
    store().setMarkupAmount(500);
    store().setPriceMode('normal');
    expect(store().markupAmount).toBe(0);
  });
});

describe('paid amount', () => {
  it('opening checkout prefills the total', () => {
    fillCart();
    store().openCheckout();
    expect(store().paidAmount).toBe(3000);
  });

  it('follows the total while checkout is open', () => {
    fillCart();
    store().openCheckout();
    store().setPriceMode('discount');
    store().setDiscountPercent(10);
    expect(store().paidAmount).toBe(2700);
  });

  it('does not change while checkout is closed', () => {
    fillCart();
    store().setPaidAmount(1000);
    store().setPriceMode('discount');
    store().setDiscountPercent(10);
    expect(store().paidAmount).toBe(1000);
  });

  it('a typed amount is reset to the total when the method changes, as on the web POS', () => {
    fillCart();
    store().openCheckout();
    store().setPaidAmount(5000);
    expect(store().paidAmount).toBe(5000);
    store().setPaymentMethod(PAYMENT_METHODS.KBZ_PAY);
    expect(store().paidAmount).toBe(3000);
  });

  it('rounds up and never goes negative', () => {
    store().setPaidAmount(1200.2);
    expect(store().paidAmount).toBe(1201);
    store().setPaidAmount(-5);
    expect(store().paidAmount).toBe(0);
  });
});

describe('payment options', () => {
  it('credit starts unpaid and keeps a typed amount', () => {
    fillCart();
    store().openCheckout();
    store().selectPaymentOption('credit');
    expect(store().paymentType).toBe('credit');
    expect(store().paidAmount).toBe(0);
    store().setPaidAmount(1500);
    store().setPriceMode('discount');
    store().setDiscountPercent(10);
    expect(store().paidAmount).toBe(1500);
  });

  it('FOC clears pricing and locks method and price mode', () => {
    fillCart();
    store().openCheckout();
    store().setPriceMode('discount');
    store().setDiscountPercent(10);
    store().selectPaymentOption('foc');
    expect(store()).toMatchObject({
      paymentType: 'paid',
      paymentMethod: PAYMENT_METHODS.FOC,
      paidAmount: 0,
      priceMode: 'normal',
      discountPercent: 0,
    });

    store().setPaymentMethod(PAYMENT_METHODS.CASH);
    store().setPriceMode('markup');
    expect(store().paymentMethod).toBe(PAYMENT_METHODS.FOC);
    expect(store().priceMode).toBe('normal');
  });

  it('back to paid from FOC uses cash and the full total', () => {
    fillCart();
    store().selectPaymentOption('foc');
    store().selectPaymentOption('paid');
    expect(store().paymentMethod).toBe(PAYMENT_METHODS.CASH);
    expect(store().paidAmount).toBe(3000);
  });
});

describe('completeSale', () => {
  it('keeps a record of the sale and starts a fresh cart', () => {
    fillCart();
    store().openCheckout();
    store().setPaidAmount(5000);
    const order = { _id: 'o1', orderNumber: 'INV/0001' };
    const before = store().saleCount;

    const sale = store().completeSale(order, null);

    expect(sale).toMatchObject({
      order,
      paymentType: 'paid',
      paymentMethod: PAYMENT_METHODS.CASH,
      paidAmount: 5000,
      customer: null,
    });
    expect(sale.items).toHaveLength(1);
    expect(sale.totals.total).toBe(3000);
    expect(store().lastSale).toBe(sale);
    expect(store().saleCount).toBe(before + 1);
    expect(store().items).toEqual([]);
    expect(store().isCheckoutOpen).toBe(false);
  });

  it('records FOC sales as unpaid', () => {
    fillCart();
    store().selectPaymentOption('foc');
    expect(store().completeSale({ _id: 'o2', orderNumber: 'INV/0002' }, null).paidAmount).toBe(0);
  });

  it('reset keeps the last sale', () => {
    fillCart();
    store().completeSale({ _id: 'o3', orderNumber: 'INV/0003' }, null);
    store().reset();
    expect(store().lastSale?.order.orderNumber).toBe('INV/0003');
  });
});

describe('reset', () => {
  it('clears everything', () => {
    fillCart();
    store().setNote('note');
    store().setCustomer({ _id: 'cp1' });
    store().selectPaymentOption('credit');
    store().reset();
    expect(store()).toMatchObject({
      items: [],
      note: '',
      creditPersonId: '',
      paymentType: 'paid',
      paymentMethod: PAYMENT_METHODS.CASH,
      paidAmount: 0,
      priceMode: 'normal',
    });
  });
});
