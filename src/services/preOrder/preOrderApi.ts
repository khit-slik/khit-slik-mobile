import { api, getErrorMessage } from '../api/client';
import type { ApiResponse } from '../pos/types';
import type { MyanmarLocations, PreOrder, PreOrderCreatePayload, PreOrderUpdatePayload } from './types';

// Like posApi, these never throw: failures come back as { success: false, message }
const failure = <T>(error: unknown, fallback: string, data: T): ApiResponse<T> => {
  console.warn(fallback, error);
  return { success: false, message: getErrorMessage(error, fallback), data };
};

export const createPreOrder = async (payload: PreOrderCreatePayload): Promise<ApiResponse<PreOrder | null>> => {
  try {
    return await api.post<ApiResponse<PreOrder>>('/pre-orders', payload);
  } catch (error) {
    return failure(error, 'Failed to create pre-order', null);
  }
};

// Only while the pre-order is still awaiting stock; doesn't change what has been paid
export const updatePreOrder = async (
  preOrderId: string,
  payload: PreOrderUpdatePayload,
): Promise<ApiResponse<PreOrder | null>> => {
  try {
    return await api.patch<ApiResponse<PreOrder>>(`/pre-orders/${encodeURIComponent(preOrderId)}`, payload);
  } catch (error) {
    return failure(error, 'Failed to update pre-order', null);
  }
};

// Each line also carries the product's current stock
export const fetchPreOrderById = async (preOrderId: string): Promise<ApiResponse<PreOrder | null>> => {
  try {
    return await api.get<ApiResponse<PreOrder>>(`/pre-orders/${encodeURIComponent(preOrderId)}`);
  } catch (error) {
    return failure(error, 'Failed to fetch pre-order', null);
  }
};

export const fetchMyanmarLocations = async (): Promise<ApiResponse<MyanmarLocations>> => {
  try {
    return await api.get<ApiResponse<MyanmarLocations>>('/myanmar-locations');
  } catch (error) {
    return failure(error, 'Failed to fetch Myanmar locations', { regions: [], yangonTownships: [] });
  }
};
