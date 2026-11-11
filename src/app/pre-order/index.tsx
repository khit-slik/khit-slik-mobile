import React from 'react';
import { router } from 'expo-router';

import PosAuthGate from '../../features/pos/components/PosAuthGate';
import { goBackOr } from '../../features/pos/navigation';
import PreOrderCatalog from '../../features/preOrder/components/PreOrderCatalog';

export default function PreOrderScreen() {
  return (
    <PosAuthGate>
      <PreOrderCatalog
        navTitle="Pre-order လက်ခံမယ်"
        navSubtitle="New pre-order"
        pageTitle="Pre-order လက်ခံမယ်"
        pageSubtitle="ပစ္စည်းမရှိသေးရင်လည်း ရွေးလို့ရပါတယ်။ ပစ္စည်းပေးတဲ့အချိန်မှ လက်ကျန်ထဲက နှုတ်ပါမယ်။"
        // Opened from a deep link there is nothing to go back to
        onBack={() => goBackOr('/')}
        onCheckout={() => router.push('/pre-order/checkout')}
      />
    </PosAuthGate>
  );
}
