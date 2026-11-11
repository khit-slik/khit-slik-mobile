// Shapes returned by the commercial backend (/api/v1), mirrored from Autoshop-Frontend services

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface Pagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

export interface WholesalePrice {
  quantity: number;
  price: number;
}

export interface PosProduct {
  _id: string;
  productName: string;
  productCode?: string;
  SKU?: string;
  category?: string;
  sellingPrice: number;
  wholesalePrices?: WholesalePrice[];
  availableQuantity?: number;
  quantity?: number;
  stockShop?: number;
  buyingPrice?: number;
  status?: 'active' | 'inactive';
}

export interface FetchProductsParams {
  page?: number;
  limit?: number;
  category?: string;
  status?: 'active' | 'inactive';
  search?: string;
}

export interface FetchProductsResponse extends ApiResponse<PosProduct[]> {
  pagination?: Pagination;
}

// Values the backend accepts for paymentMethod
export type ApiPaymentMethod =
  | 'cash'
  | 'kpay'
  | 'wavepay'
  | 'ayapay'
  | 'uabpay'
  | 'MMQR'
  | 'bank_transfer'
  | 'normal'
  | 'hot'
  | 'foc';

export interface OrderProductInput {
  inventoryId: string;
  quantity: number;
}

export interface CreateOrderRequest {
  storefrontId?: string;
  ordersProducts: OrderProductInput[];
  subTotal: number;
  tax?: number;
  discount: number;
  finalAmount: number;
  paidAmount: number;
  paymentType: 'paid' | 'credit';
  paymentMethod: ApiPaymentMethod;
  note?: string;
  orderDate?: string;
  creditPersonId?: string;
}

export interface PosOrder {
  _id: string;
  orderNumber: string;
  [key: string]: unknown;
}

// GET /order/:orderId populates each line's product with these fields only
export interface PopulatedInventory {
  _id: string;
  productName?: string;
  productCode?: string;
  SKU?: string;
}

export interface PersonRef {
  _id: string;
  name?: string;
  phone?: string;
  address?: string;
}

export interface OrderLine {
  inventoryId: PopulatedInventory | string | null;
  quantity: number;
  unitPrice?: number;
}

// A saved order, as loaded for editing
export interface PosOrderDetail extends PosOrder {
  ordersProducts: OrderLine[];
  subTotal?: number;
  discount?: number;
  finalAmount?: number;
  paidAmount?: number;
  paymentType?: 'paid' | 'credit';
  paymentMethod?: string;
  note?: string;
  createdAt?: string;
  creditPersonId?: PersonRef | string | null;
  customerId?: PersonRef | string | null;
  isDeleted?: boolean;
}

// PATCH /order/:orderId replaces the whole order; unitPrice keeps each line's price
export interface UpdateOrderRequest extends Omit<CreateOrderRequest, 'ordersProducts' | 'creditPersonId'> {
  ordersProducts: (OrderProductInput & { unitPrice: number })[];
  // null takes the customer off the order
  creditPersonId: string | null;
}

export interface CreditPersona {
  _id: string;
  name: string;
  phone: string;
  address?: string;
  blacklist: boolean;
  blacklistReason: string | null;
  blacklistDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FetchCreditPersonasParams {
  page?: number;
  limit?: number;
  search?: string;
  blacklist?: boolean;
  all?: boolean;
}

export interface CreateCreditPersonaPayload {
  name: string;
  phone: string;
  address?: string;
}

export interface BrandingProfile {
  slot: number;
  name?: string;
  phoneNumber?: string;
  address?: string;
}

export interface ShopLogo {
  url: string;
  slot: number;
}

export interface ShopSettings {
  _id: string;
  shopName: string;
  address: string;
  phoneNumber: string;
  formattedPhoneNumber?: string;
  logo?: string;
  // Up to three logos, one per branding slot
  logos?: ShopLogo[];
  brandingProfiles?: BrandingProfile[];
  currency?: string;
  taxRate?: number;
}
