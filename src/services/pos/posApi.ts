import { api, getErrorMessage } from '../api/client';
import type {
  ApiResponse,
  CreateCreditPersonaPayload,
  CreateOrderRequest,
  CreditPersona,
  FetchCreditPersonasParams,
  FetchProductsParams,
  FetchProductsResponse,
  PosOrder,
  PosOrderDetail,
  PosProduct,
  ShopSettings,
  UpdateOrderRequest,
} from './types';

// Like the web services, these never throw: failures come back as { success: false, message }
const failure = <T>(error: unknown, fallback: string, data: T): ApiResponse<T> => {
  console.warn(fallback, error);
  return { success: false, message: getErrorMessage(error, fallback), data };
};

export const fetchProducts = async (
  params: FetchProductsParams = {},
): Promise<FetchProductsResponse> => {
  try {
    return await api.get<FetchProductsResponse>('/inventory', {
      ...params,
      category: params.category && params.category !== 'All' ? params.category : undefined,
    });
  } catch (error) {
    return failure(error, 'Failed to fetch products', []);
  }
};

// One product with its current stock (GET /inventory/:id)
export const fetchProductById = async (id: string): Promise<ApiResponse<PosProduct | null>> => {
  try {
    return await api.get<ApiResponse<PosProduct>>(`/inventory/${encodeURIComponent(id)}`);
  } catch (error) {
    return failure(error, 'Failed to fetch product', null);
  }
};

const FETCH_CONCURRENCY = 5;

// Several products with current stock, a few requests at a time; ones that fail to load are left out
export const fetchProductsByIds = async (ids: string[]): Promise<Map<string, PosProduct>> => {
  const products = new Map<string, PosProduct>();
  for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
    const batch = ids.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((id) => fetchProductById(id)));
    results.forEach((res, index) => {
      if (res.success && res.data) products.set(batch[index], res.data);
    });
  }
  return products;
};

export const fetchCategories = async (): Promise<ApiResponse<string[]>> => {
  try {
    return await api.get<ApiResponse<string[]>>('/inventory/categories');
  } catch (error) {
    return failure(error, 'Failed to fetch categories', []);
  }
};

export const createOrder = async (
  payload: CreateOrderRequest,
): Promise<ApiResponse<PosOrder | null>> => {
  try {
    return await api.post<ApiResponse<PosOrder>>('/order', payload);
  } catch (error) {
    return failure(error, 'Failed to create order', null);
  }
};

export const fetchOrderById = async (orderId: string): Promise<ApiResponse<PosOrderDetail | null>> => {
  try {
    return await api.get<ApiResponse<PosOrderDetail>>(`/order/${encodeURIComponent(orderId)}`);
  } catch (error) {
    return failure(error, 'Failed to fetch order', null);
  }
};

// Saves an edited order; the backend checks stock and moves it by the change in each quantity
export const updateOrder = async (
  orderId: string,
  payload: UpdateOrderRequest,
): Promise<ApiResponse<PosOrderDetail | null>> => {
  try {
    return await api.patch<ApiResponse<PosOrderDetail>>(`/order/${encodeURIComponent(orderId)}`, payload);
  } catch (error) {
    return failure(error, 'Failed to update order', null);
  }
};

export const fetchCreditPersonas = async (
  params: FetchCreditPersonasParams = {},
): Promise<ApiResponse<CreditPersona[]>> => {
  try {
    return await api.get<ApiResponse<CreditPersona[]>>('/credit-persona', { ...params });
  } catch (error) {
    return failure(error, 'Failed to fetch credit personas', []);
  }
};

export const createCreditPersona = async (
  payload: CreateCreditPersonaPayload,
): Promise<ApiResponse<CreditPersona | null>> => {
  try {
    return await api.post<ApiResponse<CreditPersona>>('/credit-persona', payload);
  } catch (error) {
    return failure(error, 'Failed to create credit persona', null);
  }
};

export const fetchShopSettings = async (): Promise<ApiResponse<ShopSettings | null>> => {
  try {
    return await api.get<ApiResponse<ShopSettings>>('/shop-settings');
  } catch (error) {
    return failure(error, 'Failed to fetch shop settings', null);
  }
};
