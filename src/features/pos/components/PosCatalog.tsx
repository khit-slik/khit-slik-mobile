import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PosProduct } from '../../../services/pos/types';
import { useCart, useCartTotals } from '../../../store/cartStore';
import { useShopStore } from '../../../store/shopStore';
import { toast } from '../../../store/toastStore';
import { useCategories, useDebouncedValue, useProducts } from '../hooks/usePosData';
import { CART_ERROR_MESSAGES, CartError, filterProducts, StockFilter } from '../lib';
import { colors, TABLET_MIN_WIDTH, toBurmeseNumber } from '../theme';
import CartButton from './CartButton';
import CartSheet from './CartSheet';
import PosFilters, { ALL_CATEGORIES } from './PosFilters';
import PosNavbar from './PosNavbar';
import ProductCard from './ProductCard';
import WholesaleSheet from './WholesaleSheet';
import TutorialVideoSheet from '../../tutorials/TutorialVideoSheet';
import type { TutorialVideo } from '../../tutorials/tutorialVideos';

interface Props {
  navTitle: string;
  navSubtitle: string;
  pageTitle: string;
  pageSubtitle: string;
  onBack: () => void;
  // The cart is ready to check out; open the checkout popup
  onCheckout: () => void;
  // How-to videos for this screen, opened from the navbar
  tutorials?: TutorialVideo[];
}

const showError = (error: CartError | undefined) => {
  if (error) toast.error(CART_ERROR_MESSAGES[error]);
};

// Product grid, filters and cart of the POS, working on whichever cart CartStoreContext provides
export default function PosCatalog({
  navTitle,
  navSubtitle,
  pageTitle,
  pageSubtitle,
  onBack,
  onCheckout,
  tutorials = [],
}: Props) {
  const { width } = useWindowDimensions();
  // One product per row on phones, two on tablets
  const columns = width >= TABLET_MIN_WIDTH ? 2 : 1;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [stockFilter, setStockFilter] = useState<StockFilter>('All');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [wholesaleProduct, setWholesaleProduct] = useState<PosProduct | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  const items = useCart((state) => state.items);
  const originalQuantities = useCart((state) => state.originalQuantities);
  const saleCount = useCart((state) => state.saleCount);
  const addProduct = useCart((state) => state.addProduct);
  const applyWholesaleTier = useCart((state) => state.applyWholesaleTier);
  const openCheckout = useCart((state) => state.openCheckout);
  const refreshStock = useCart((state) => state.refreshStock);
  const totals = useCartTotals();

  const debouncedSearch = useDebouncedValue(search.trim());
  const categories = useCategories();
  const { products, totalItems, error, isLoading, isRefreshing, isLoadingMore, loadMore } = useProducts({
    search: debouncedSearch,
    category,
    // Reload after a sale too, so stock levels are current
    reloadToken: `${refreshNonce}:${saleCount}`,
  });

  const visibleProducts = useMemo(() => filterProducts(products, stockFilter), [products, stockFilter]);
  const cartQtyById = useMemo(() => new Map(items.map((item) => [item.product._id, item.qty])), [items]);

  // Cart lines follow the stock the grid has just loaded
  useEffect(() => {
    if (products.length > 0) refreshStock(products);
  }, [products, refreshStock]);

  // Shop branding for receipts, fetched while the cashier picks products
  useEffect(() => {
    useShopStore.getState().loadSettings();
  }, []);

  const handleProductPress = useCallback((product: PosProduct) => showError(addProduct(product)), [addProduct]);
  const handleWholesalePress = useCallback((product: PosProduct) => setWholesaleProduct(product), []);
  const refresh = () => setRefreshNonce((n) => n + 1);

  const handleSelectTier = (product: PosProduct, tierQuantity: number) => {
    showError(applyWholesaleTier(product, tierQuantity));
    setWholesaleProduct(null);
  };

  const handleCheckout = () => {
    openCheckout();
    setIsCartOpen(false);
    onCheckout();
  };

  // Scrolls with the products, like the web page
  const listHeader = (
    <View style={styles.listHeader}>
      <View>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
        <Text style={styles.pageSubtitle}>{pageSubtitle}</Text>
      </View>
      <PosFilters
        search={search}
        onSearchChange={setSearch}
        categories={categories}
        category={category}
        onCategoryChange={setCategory}
        stockFilter={stockFilter}
        onStockFilterChange={setStockFilter}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />
      <Text style={styles.countText}>
        ပစ္စည်း စုစုပေါင်း {toBurmeseNumber(Math.max(totalItems, visibleProducts.length))} ခုအနက်{' '}
        {toBurmeseNumber(visibleProducts.length)} ခု ပြထားပါတယ်
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <PosNavbar
        title={navTitle}
        subtitle={navSubtitle}
        onBack={onBack}
        onTutorialPress={tutorials.length > 0 ? () => setIsTutorialOpen(true) : undefined}
      />

      {isTutorialOpen && <TutorialVideoSheet videos={tutorials} onClose={() => setIsTutorialOpen(false)} />}

      <View style={styles.page}>
        <View style={styles.card}>
          <FlatList
            // numColumns can't change on a mounted FlatList
            key={`pos-grid-${columns}`}
            data={isLoading ? [] : visibleProducts}
            keyExtractor={(product) => product._id}
            numColumns={columns}
            // FlatList rejects a column wrapper style on single-column lists
            columnWrapperStyle={columns > 1 ? styles.column : undefined}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListHeaderComponent={listHeader}
            renderItem={({ item }) => (
              <ProductCard
                product={item}
                cartQty={cartQtyById.get(item._id) ?? 0}
                originalQty={originalQuantities[item._id] ?? 0}
                columns={columns}
                onPress={handleProductPress}
                onWholesalePress={handleWholesalePress}
              />
            )}
            onEndReached={loadMore}
            onEndReachedThreshold={0.6}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} colors={[colors.primary]} />}
            ListEmptyComponent={
              isLoading ? (
                <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
              ) : (
                <Text style={styles.empty}>{error || 'ပစ္စည်း မရှိသေးပါ'}</Text>
              )
            }
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.footerLoaderText}>ပစ္စည်းများ ထပ်မံဖော်ပြနေပါသည်...</Text>
                </View>
              ) : null
            }
          />
        </View>
      </View>

      {items.length > 0 && (
        <SafeAreaView edges={['bottom']} style={styles.cartBar} pointerEvents="box-none">
          <CartButton itemCount={totals.itemCount} subtotal={totals.subtotal} onPress={() => setIsCartOpen(true)} />
        </SafeAreaView>
      )}

      {/* The cart closes by itself once it's emptied */}
      <CartSheet
        visible={isCartOpen && items.length > 0}
        onClose={() => setIsCartOpen(false)}
        onCheckout={handleCheckout}
      />
      <WholesaleSheet
        product={wholesaleProduct}
        onClose={() => setWholesaleProduct(null)}
        onSelectTier={handleSelectTier}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Behind the status bar: the web header's page colour, so the top looks the same on both
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f3',
  },
  // Grey page behind the white card, as on the web
  page: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  card: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  listHeader: {
    gap: 16,
    paddingBottom: 14,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 4,
  },
  countText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  grid: {
    padding: 16,
    paddingBottom: 110,
    gap: 12,
  },
  column: {
    gap: 12,
  },
  loading: {
    marginVertical: 48,
  },
  empty: {
    textAlign: 'center',
    color: colors.textFaint,
    paddingVertical: 48,
  },
  footerLoader: {
    alignItems: 'center',
    gap: 6,
    marginVertical: 16,
  },
  footerLoaderText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  cartBar: {
    position: 'absolute',
    left: 16,
    right: 20,
    bottom: 16,
  },
});
