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
import { usePreOrder, usePreOrderTotals } from '../../../store/preOrderStore';
import { useShopStore } from '../../../store/shopStore';
import CartButton from '../../pos/components/CartButton';
import PosFilters, { ALL_CATEGORIES } from '../../pos/components/PosFilters';
import PosNavbar from '../../pos/components/PosNavbar';
import ProductCard from '../../pos/components/ProductCard';
import WholesaleSheet from '../../pos/components/WholesaleSheet';
import { useCategories, useDebouncedValue, useProducts } from '../../pos/hooks/usePosData';
import { filterProducts } from '../../pos/lib';
import { colors, TABLET_MIN_WIDTH, toBurmeseNumber } from '../../pos/theme';
import PreOrderCartSheet from './PreOrderCartSheet';

interface Props {
  navTitle: string;
  navSubtitle: string;
  pageTitle: string;
  pageSubtitle: string;
  onBack: () => void;
  // The form has products; open the checkout popup
  onCheckout: () => void;
}

// The POS product grid for a pre-order (whichever form PreOrderStoreContext provides):
// every active product can be picked, with no stock badge or stock filter (as on the web)
export default function PreOrderCatalog({ navTitle, navSubtitle, pageTitle, pageSubtitle, onBack, onCheckout }: Props) {
  const { width } = useWindowDimensions();
  const columns = width >= TABLET_MIN_WIDTH ? 2 : 1;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [wholesaleProduct, setWholesaleProduct] = useState<PosProduct | null>(null);

  const items = usePreOrder((state) => state.items);
  const saveCount = usePreOrder((state) => state.saveCount);
  const addProduct = usePreOrder((state) => state.addProduct);
  const setQty = usePreOrder((state) => state.setQty);
  const refreshStock = usePreOrder((state) => state.refreshStock);
  const totals = usePreOrderTotals();

  const debouncedSearch = useDebouncedValue(search.trim());
  const categories = useCategories();
  const { products, totalItems, error, isLoading, isRefreshing, isLoadingMore, loadMore } = useProducts({
    search: debouncedSearch,
    category,
    reloadToken: `${refreshNonce}:${saveCount}`,
  });

  // No stock filter: every product can be pre-ordered, in stock or not
  const visibleProducts = useMemo(() => filterProducts(products, 'All'), [products]);
  const qtyById = useMemo(() => new Map(items.map((item) => [item.product._id, item.qty])), [items]);

  useEffect(() => {
    if (products.length > 0) refreshStock(products);
  }, [products, refreshStock]);

  // Shop branding for the voucher, fetched while products are picked
  useEffect(() => {
    useShopStore.getState().loadSettings();
  }, []);

  const handleProductPress = useCallback((product: PosProduct) => addProduct(product), [addProduct]);
  const handleWholesalePress = useCallback((product: PosProduct) => setWholesaleProduct(product), []);
  const refresh = () => setRefreshNonce((n) => n + 1);

  // A wholesale tier sets the line to that quantity (no stock limit on a pre-order)
  const handleSelectTier = (product: PosProduct, tierQuantity: number) => {
    if (!qtyById.has(product._id)) addProduct(product);
    setQty(product._id, tierQuantity);
    setWholesaleProduct(null);
  };

  const handleCheckout = () => {
    if (items.length === 0) return;
    setIsCartOpen(false);
    onCheckout();
  };

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
      <PosNavbar title={navTitle} subtitle={navSubtitle} onBack={onBack} />

      <View style={styles.page}>
        <View style={styles.card}>
          <FlatList
            key={`pre-order-grid-${columns}`}
            data={isLoading ? [] : visibleProducts}
            keyExtractor={(product) => product._id}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? styles.column : undefined}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListHeaderComponent={listHeader}
            renderItem={({ item }) => (
              <ProductCard
                product={item}
                cartQty={qtyById.get(item._id) ?? 0}
                columns={columns}
                preOrderMode
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

      <PreOrderCartSheet
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
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f3',
  },
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
