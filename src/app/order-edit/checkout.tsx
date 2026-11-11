import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';

import { checkStockAfterOrderEdit } from '../../features/notifications/checkStockAfterSale';
import CheckoutForm from '../../features/pos/components/checkout/CheckoutForm';
import { buildUpdateOrderPayload, CheckoutInput, getOrderCustomer } from '../../features/pos/lib';
import { goBackOr } from '../../features/pos/navigation';
import { updateOrder } from '../../services/pos/posApi';
import type { CreditPersona } from '../../services/pos/types';
import { CartStoreContext, useOrderEditCartStore } from '../../store/cartStore';

const close = () => goBackOr('/');

export default function OrderEditCheckoutScreen() {
  // Read once: saving clears the cart, and with it the order being edited, before this popup is replaced
  const [order] = useState(() => useOrderEditCartStore.getState().editingOrder);

  useEffect(() => {
    if (!order) close();
  }, [order]);

  // The order's own customer stays selectable even if the customer list leaves them out
  const extraCustomer = useMemo((): CreditPersona | null => {
    const customer = order && getOrderCustomer(order);
    if (!customer) return null;
    return {
      _id: customer._id,
      name: customer.name || 'Customer',
      phone: customer.phone || '',
      address: customer.address,
      blacklist: false,
      blacklistReason: null,
      blacklistDate: null,
      createdAt: '',
      updatedAt: '',
    };
  }, [order]);

  const submit = useCallback(
    async (input: CheckoutInput, customer: CreditPersona | null) => {
      if (!order) return 'ဘောင်ချာ ရှာမတွေ့ပါ';
      const res = await updateOrder(order._id, buildUpdateOrderPayload(input));
      if (!res.success) return res.message || 'ဘောင်ချာ ပြင်ဆင်ရန် မအောင်မြင်ပါ';

      const store = useOrderEditCartStore.getState();
      const { originalQuantities } = store;
      const sale = store.completeSale(res.data ?? order, customer);
      router.replace('/order-edit/success');
      // Stock moved by the change in each quantity: re-read those products and notify if any are low
      checkStockAfterOrderEdit(sale.items, originalQuantities);
      return null;
    },
    [order],
  );

  if (!order) return null;

  return (
    <CartStoreContext.Provider value={useOrderEditCartStore}>
      <CheckoutForm
        title="ဘောင်ချာ ပြင်ဆင်မယ်"
        submitLabel="ပြင်ဆင်မှု သိမ်းမယ်"
        onSubmit={submit}
        onClose={close}
        extraCustomer={extraCustomer}
      />
    </CartStoreContext.Provider>
  );
}
