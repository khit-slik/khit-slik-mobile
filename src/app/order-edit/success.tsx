import React, { useEffect } from 'react';
import { router } from 'expo-router';

import SaleDoneCard from '../../features/pos/components/SaleDoneCard';
import { webBridge } from '../../services/webBridge';
import { useOrderEditCartStore } from '../../store/cartStore';

// Close the native screens and reload the web page underneath so it shows the edited order
const finish = (path?: string) => {
  webBridge.reload(path);
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
};

export default function OrderEditSuccessScreen() {
  const sale = useOrderEditCartStore((state) => state.lastSale);

  useEffect(() => {
    if (!sale) finish();
  }, [sale]);

  if (!sale) return null;

  return (
    <SaleDoneCard
      key={`${sale.order._id}:${sale.completedAt}`}
      sale={sale}
      title="ပြင်ဆင်မှု အောင်မြင်ပါတယ်"
      subtitle="ဘောင်ချာ ပြင်ဆင်မှုများကို အောင်မြင်စွာ သိမ်းထားပြီးပါပြီ"
      // Back to the page the edit was opened from
      onExit={() => finish()}
      onViewOrders={() => finish(sale.paymentType === 'credit' ? '/credit-orders' : '/orders')}
    />
  );
}
