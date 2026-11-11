import { useMemo } from 'react';
import { create } from 'zustand';
import RNFS from 'react-native-fs';

import { countUnread, mergeAlerts, StockAlertItem, toAlerts } from '../features/notifications/lib/stockAlerts';
import { fetchProducts } from '../services/pos/posApi';
import type { PosProduct } from '../services/pos/types';
import { useNotificationSettingsStore } from './notificationSettingsStore';

const READ_IDS_PATH = `${RNFS.DocumentDirectoryPath}/read_notifications.json`;
const PAGE_SIZE = 100;
// Safety cap so a huge catalogue can't keep the page loading forever
const MAX_PAGES = 30;

interface StockAlertState {
  alerts: StockAlertItem[];
  readIds: string[];
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  // Full list, only when the notification page opens or is refreshed (never on a timer)
  loadAlerts: () => Promise<void>;
  // Fresh stock for products just sold
  applyProducts: (products: PosProduct[]) => void;
  markAsRead: (productId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const rules = () => {
  const { lowStockThreshold, outOfStockAlert } = useNotificationSettingsStore.getState();
  return { lowStockThreshold, outOfStockAlert };
};

const saveReadIds = async (ids: string[]) => {
  try {
    await RNFS.writeFile(READ_IDS_PATH, JSON.stringify(ids), 'utf8');
  } catch (err) {
    console.warn('Failed to save read notifications:', err);
  }
};

const loadReadIds = async (): Promise<string[]> => {
  try {
    if (!(await RNFS.exists(READ_IDS_PATH))) return [];
    const saved = JSON.parse(await RNFS.readFile(READ_IDS_PATH, 'utf8'));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

// The backend has no stock filter, so this walks every page of active products
const fetchAllActiveProducts = async (): Promise<{ products: PosProduct[] } | { error: string }> => {
  const products: PosProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchProducts({ page, limit: PAGE_SIZE, status: 'active' });
    if (!res.success) return { error: res.message };
    products.push(...(res.data || []));
    if (page >= (res.pagination?.totalPages ?? 1) || !res.data?.length) break;
  }
  return { products };
};

export const useStockAlertStore = create<StockAlertState>((set, get) => ({
  alerts: [],
  readIds: [],
  isLoading: false,
  isLoaded: false,
  error: null,

  loadAlerts: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    const settings = useNotificationSettingsStore.getState();
    if (!settings.isLoaded) await settings.loadSettings();
    const savedReadIds = get().isLoaded ? get().readIds : await loadReadIds();

    if (!useNotificationSettingsStore.getState().enabled) {
      set({ alerts: [], readIds: savedReadIds, isLoading: false, isLoaded: true });
      return;
    }

    const result = await fetchAllActiveProducts();
    if ('error' in result) {
      set({ isLoading: false, isLoaded: true, error: result.error, readIds: savedReadIds });
      return;
    }
    const alerts = toAlerts(result.products, rules());
    // Forget "read" marks for products that are no longer low
    const active = new Set(alerts.map((a) => a.id));
    const readIds = savedReadIds.filter((id) => active.has(id));
    set({ alerts, readIds, isLoading: false, isLoaded: true });
    saveReadIds(readIds);
  },

  applyProducts: (products) => {
    if (!useNotificationSettingsStore.getState().enabled || products.length === 0) return;
    set({ alerts: mergeAlerts(get().alerts, products, rules()) });
  },

  markAsRead: async (productId) => {
    const ids = get()
      .alerts.filter((a) => a.productId === productId)
      .map((a) => a.id);
    const readIds = Array.from(new Set([...get().readIds, ...ids]));
    set({ readIds });
    await saveReadIds(readIds);
  },

  markAllAsRead: async () => {
    const readIds = get().alerts.map((a) => a.id);
    set({ readIds });
    await saveReadIds(readIds);
  },
}));

export const useUnreadAlertCount = () => {
  const alerts = useStockAlertStore((state) => state.alerts);
  const readIds = useStockAlertStore((state) => state.readIds);
  return useMemo(() => countUnread(alerts, readIds), [alerts, readIds]);
};
