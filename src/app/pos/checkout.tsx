import React from 'react';
import { router } from 'expo-router';

import { checkStockAfterSale } from '../../features/notifications/checkStockAfterSale';
import CheckoutForm from '../../features/pos/components/checkout/CheckoutForm';
import { buildCreateOrderPayload, CheckoutInput } from '../../features/pos/lib';
import { goBackOr } from '../../features/pos/navigation';
import { createOrder } from '../../services/pos/posApi';
import type { CreditPersona } from '../../services/pos/types';
import { useCartStore } from '../../store/cartStore';

const close = () => goBackOr('/pos');

const submit = async (input: CheckoutInput, customer: CreditPersona | null) => {
  const res = await createOrder(buildCreateOrderPayload(input));
  if (!res.success || !res.data) return res.message || 'ရောင်းချမှု လုပ်ဆောင်ရန် မအောင်မြင်ပါ';

  const sale = useCartStore.getState().completeSale(res.data, customer);
  router.replace('/pos/success');
  // The sale lowered stock: re-read the sold products and notify if any are low (not awaited)
  checkStockAfterSale(sale.items);
  return null;
};

export default function CheckoutScreen() {
  return <CheckoutForm title="ဘောင်ချာ ဖွင့်မယ်" submitLabel="ဘောင်ချာသိမ်းမယ်" onSubmit={submit} onClose={close} />;
}
