import React, { useEffect } from 'react';
import { router } from 'expo-router';

import SaleDoneCard from '../../features/pos/components/SaleDoneCard';
import { goBackOr } from '../../features/pos/navigation';
import { webBridge } from '../../services/webBridge';
import { useCartStore } from '../../store/cartStore';

// Close the popup: back to the product grid for the next customer
const startNewSale = () => goBackOr('/pos');

export default function SuccessScreen() {
  // Checkout was replaced by this popup, so Android back already lands on the product grid
  const sale = useCartStore((state) => state.lastSale);

  useEffect(() => {
    if (!sale) startNewSale();
  }, [sale]);

  if (!sale) return null;

  const goToOrders = () => {
    webBridge.navigate(sale.paymentType === 'credit' ? '/credit-orders' : '/orders');
    router.dismissAll();
  };

  return (
    <SaleDoneCard
      key={sale.order._id}
      sale={sale}
      title="ရောင်းချမှု အောင်မြင်ပါတယ်"
      subtitle="အရောင်း ဘောင်ချာ အောင်မြင်စွာ သိမ်းထားပြီးပါပြီ"
      onExit={startNewSale}
      onViewOrders={goToOrders}
    />
  );
}
