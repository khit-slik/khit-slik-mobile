import { notificationService } from '../../../services/notificationService';
import { fetchProductsByIds } from '../../../services/pos/posApi';
import type { PosProduct } from '../../../services/pos/types';
import { useStockAlertStore } from '../../../store/stockAlertStore';
import { checkStockAfterOrderEdit } from '../checkStockAfterSale';

jest.mock('../../../services/notificationService', () => ({
  notificationService: {
    sendLowStockNotification: jest.fn(),
    sendOutOfStockNotification: jest.fn(),
    sendSummaryNotification: jest.fn(),
  },
}));
jest.mock('../../../services/pos/posApi', () => ({ fetchProductsByIds: jest.fn() }));
jest.mock('../../../store/stockAlertStore', () => {
  const applyProducts = jest.fn();
  return { useStockAlertStore: { getState: () => ({ applyProducts }) } };
});
jest.mock('../../../store/notificationSettingsStore', () => ({
  useNotificationSettingsStore: {
    getState: () => ({ isLoaded: true, enabled: true, lowStockThreshold: 5, outOfStockAlert: true }),
  },
}));

const product = (id: string, availableQuantity: number): PosProduct => ({
  _id: id,
  productName: id,
  sellingPrice: 100,
  availableQuantity,
});

const mockFetch = fetchProductsByIds as jest.Mock;
const applyProducts = useStockAlertStore.getState().applyProducts as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('checkStockAfterOrderEdit', () => {
  // oil went from 2 to 3, belt was added, filter was taken off; all three end up low
  const items = [
    { product: product('oil', 3), qty: 3 },
    { product: product('belt', 2), qty: 1 },
  ];
  const original = { oil: 2, filter: 1 };

  it('refreshes every touched product but only notifies for ones the edit took more of', async () => {
    mockFetch.mockResolvedValue(new Map([
      ['oil', product('oil', 2)],
      ['belt', product('belt', 0)],
      ['filter', product('filter', 3)],
    ]));

    await checkStockAfterOrderEdit(items, original);

    expect(mockFetch).toHaveBeenCalledWith(['oil', 'belt', 'filter']);
    expect(applyProducts.mock.calls[0][0].map((p: PosProduct) => p._id)).toEqual(['oil', 'belt', 'filter']);
    expect(notificationService.sendLowStockNotification).toHaveBeenCalledTimes(1);
    expect(notificationService.sendLowStockNotification).toHaveBeenCalledWith('oil', 2);
    expect(notificationService.sendOutOfStockNotification).toHaveBeenCalledWith('belt');
  });

  it('estimates a product that could not be re-read from what the edit took', async () => {
    mockFetch.mockResolvedValue(new Map());

    await checkStockAfterOrderEdit(items, original);

    // oil showed 3 with the order's 2 held; one more was taken. belt showed 2; one was taken.
    expect(applyProducts.mock.calls[0][0].map((p: PosProduct) => [p._id, p.availableQuantity])).toEqual([
      ['oil', 2],
      ['belt', 1],
    ]);
  });
});
