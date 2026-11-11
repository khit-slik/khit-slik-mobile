import { notificationService } from '../../services/notificationService';
import { fetchProductsByIds } from '../../services/pos/posApi';
import type { PosProduct } from '../../services/pos/types';
import { useNotificationSettingsStore } from '../../store/notificationSettingsStore';
import { useStockAlertStore } from '../../store/stockAlertStore';
import { getProductsWithLessStock, getSafeQty, getShelfStock, getTouchedProductIds } from '../pos/lib';
import type { CartItem, OriginalQuantities } from '../pos/lib';
import { toAlerts } from './lib/stockAlerts';

// More products than this going low in one sale get one summary notification instead of one each
const MAX_SEPARATE_NOTIFICATIONS = 3;

// Re-read the given products; `estimate` stands in for one that can't be read (null leaves it out)
const fetchFresh = async (
  ids: string[],
  estimate: (id: string) => PosProduct | null,
): Promise<PosProduct[]> => {
  const fetched = await fetchProductsByIds(ids);
  return ids.flatMap((id) => {
    const product = fetched.get(id) ?? estimate(id);
    return product ? [product] : [];
  });
};

const notifyLowStock = async (products: PosProduct[]) => {
  const { lowStockThreshold, outOfStockAlert } = useNotificationSettingsStore.getState();
  const alerts = toAlerts(products, { lowStockThreshold, outOfStockAlert });
  if (alerts.length === 0) return;

  if (alerts.length > MAX_SEPARATE_NOTIFICATIONS) {
    const outOfStock = alerts.filter((a) => a.type === 'out_of_stock').length;
    await notificationService.sendSummaryNotification(outOfStock, alerts.length - outOfStock);
    return;
  }
  for (const alert of alerts) {
    if (alert.type === 'out_of_stock') await notificationService.sendOutOfStockNotification(alert.productName);
    else await notificationService.sendLowStockNotification(alert.productName, alert.stockQty);
  }
};

const isEnabled = async () => {
  const settings = useNotificationSettingsStore.getState();
  if (!settings.isLoaded) await settings.loadSettings();
  return useNotificationSettingsStore.getState().enabled;
};

// After a native POS sale is saved: read the sold products' stock again and notify, as offline-pos does
export const checkStockAfterSale = async (items: CartItem[]) => {
  try {
    if (!(await isEnabled()) || items.length === 0) return;

    const byId = new Map(items.map((item) => [item.product._id, item]));
    const products = await fetchFresh([...byId.keys()], (id) => {
      const item = byId.get(id)!;
      return { ...item.product, availableQuantity: getShelfStock(item.product) - getSafeQty(item.qty) };
    });
    useStockAlertStore.getState().applyProducts(products);
    await notifyLowStock(products);
  } catch (err) {
    console.warn('Stock check after sale failed:', err);
  }
};

// After a saved order is edited. Every product it touched is read again so the notification page
// is current (stock given back can clear an alert), but only products the edit took more of notify.
export const checkStockAfterOrderEdit = async (items: CartItem[], originalQuantities: OriginalQuantities) => {
  try {
    if (!(await isEnabled())) return;

    const byId = new Map(items.map((item) => [item.product._id, item]));
    const products = await fetchFresh(getTouchedProductIds(items, originalQuantities), (id) => {
      const item = byId.get(id);
      if (!item) return null;
      // The cart showed stock with this order's own quantity already taken out
      const taken = getSafeQty(item.qty) - (originalQuantities[id] || 0);
      return { ...item.product, availableQuantity: getShelfStock(item.product) - taken };
    });
    useStockAlertStore.getState().applyProducts(products);

    const lessStock = new Set(getProductsWithLessStock(items, originalQuantities));
    await notifyLowStock(products.filter((product) => lessStock.has(product._id)));
  } catch (err) {
    console.warn('Stock check after order edit failed:', err);
  }
};
