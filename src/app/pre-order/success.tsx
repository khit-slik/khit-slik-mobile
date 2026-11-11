import React, { useEffect } from 'react';
import { router } from 'expo-router';

import { goBackOr } from '../../features/pos/navigation';
import PreOrderDoneCard from '../../features/preOrder/components/PreOrderDoneCard';
import { webBridge } from '../../services/webBridge';
import { usePreOrderStore } from '../../store/preOrderStore';

// Back to the product grid for the next pre-order; the web page underneath reloads so its list
// shows this one when the grid is left
const startNew = () => {
  webBridge.reload();
  goBackOr('/pre-order');
};

// Close the native screens and open the web pre-order list, loaded fresh
const showList = () => {
  webBridge.reload('/pre-orders');
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
};

export default function PreOrderSuccessScreen() {
  const saved = usePreOrderStore((state) => state.lastSaved);

  useEffect(() => {
    if (!saved) goBackOr('/pre-order');
  }, [saved]);

  if (!saved) return null;

  return (
    <PreOrderDoneCard
      key={saved.savedAt}
      saved={saved}
      title="Pre-order လက်ခံပြီးပါပြီ"
      subtitle="ပစ္စည်းရောက်ရင် Pre-order စာရင်းမှ 'ပစ္စည်းပေးမယ်' ကို နှိပ်ပါ"
      onExit={startNew}
      onViewList={showList}
    />
  );
}
