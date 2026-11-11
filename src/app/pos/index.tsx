import React from 'react';
import { router } from 'expo-router';

import PosAuthGate from '../../features/pos/components/PosAuthGate';
import PosCatalog from '../../features/pos/components/PosCatalog';
import { goBackOr } from '../../features/pos/navigation';
import { POS_TUTORIALS } from '../../features/tutorials/tutorialVideos';

export default function PosScreen() {
  return (
    <PosAuthGate>
      <PosCatalog
        navTitle="အရောင်း ဘောင်ချာထုတ်မယ်"
        navSubtitle="Checkout (POS)"
        pageTitle="Voucher Checkout"
        pageSubtitle="Select products and check out voucher for the customer"
        // Opened from a deep link there is nothing to go back to
        onBack={() => goBackOr('/')}
        onCheckout={() => router.push('/pos/checkout')}
        tutorials={POS_TUTORIALS}
      />
    </PosAuthGate>
  );
}
