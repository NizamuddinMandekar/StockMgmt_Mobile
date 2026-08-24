import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import DatePicker from '../components/DatePicker';
import ProductPicker from '../components/ProductPicker';
import ScreenHeader from '../components/ScreenHeader';
import { Button, Card, EmptyState, SectionTitle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { productsApi, stockApi } from '../services/api';
import { colors, radius } from '../theme';

const emptyFilters = { fromDate: '', toDate: '', productId: null };

export default function WastageScreen() {
  const { activeBranchId } = useAuth();
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(emptyFilters);

  const load = useCallback(async () => {
    try {
      const [productList, movementList] = await Promise.all([productsApi.list(), stockApi.movements()]);
      setProducts(productList);
      setMovements(
        movementList
          .filter((m) => m.movement_type === 'wastage' && m.warehouse_id === activeBranchId)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      );
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const costOf = (m) => Math.abs(m.quantity) * Number(productMap[m.product_id]?.purchase_price || 0);

  const handleReset = () => setFilters(emptyFilters);

  const filtered = useMemo(
    () =>
      movements.filter((m) => {
        if (filters.productId && m.product_id !== filters.productId) return false;
        const createdDate = new Date(m.created_at);
        if (filters.fromDate && createdDate < new Date(filters.fromDate)) return false;
        if (filters.toDate && createdDate > new Date(`${filters.toDate}T23:59:59`)) return false;
        return true;
      }),
    [movements, filters],
  );

  const { totalCost, todaysCost, totalQty } = useMemo(() => {
    const today = new Date().toDateString();
    return {
      totalCost: movements.reduce((sum, m) => sum + costOf(m), 0),
      totalQty: movements.reduce((sum, m) => sum + Math.abs(m.quantity), 0),
      todaysCost: movements
        .filter((m) => new Date(m.created_at).toDateString() === today)
        .reduce((sum, m) => sum + costOf(m), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, products]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Wastage Report" />
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.grid}>
              <Animated.View entering={FadeInDown.duration(300)} style={styles.statCard}>
                <Card>
                  <Text style={styles.statLabel}>Total Wastage Cost</Text>
                  <Text style={[styles.statValue, { color: colors.danger }]}>Rs {totalCost.toFixed(0)}</Text>
                </Card>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(60).duration(300)} style={styles.statCard}>
                <Card>
                  <Text style={styles.statLabel}>Today's Wastage Cost</Text>
                  <Text style={[styles.statValue, { color: colors.warning }]}>Rs {todaysCost.toFixed(0)}</Text>
                </Card>
              </Animated.View>
            </View>
            <Animated.View entering={FadeInDown.delay(120).duration(300)}>
              <Card>
                <Text style={styles.statLabel}>Total Quantity Wasted</Text>
                <Text style={styles.statValue}>{Math.round(totalQty).toLocaleString()}</Text>
              </Card>
            </Animated.View>

            <SectionTitle>Filter Wastage</SectionTitle>
            <Card style={styles.filterCard}>
              <View style={styles.rowInputs}>
                <View style={{ flex: 1 }}>
                  <FieldLabel>From Date</FieldLabel>
                  <DatePicker value={filters.fromDate} onChange={(v) => setFilters((f) => ({ ...f, fromDate: v }))} placeholder="Any" />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldLabel>To Date</FieldLabel>
                  <DatePicker value={filters.toDate} onChange={(v) => setFilters((f) => ({ ...f, toDate: v }))} placeholder="Any" />
                </View>
              </View>

              <FieldLabel>Item</FieldLabel>
              <ProductPicker
                products={products}
                value={filters.productId}
                onChange={(id) => setFilters((f) => ({ ...f, productId: id }))}
                placeholder="All Items"
              />

              <Button title="Reset" variant="outline" onPress={handleReset} style={{ marginTop: 10 }} />
            </Card>

            <SectionTitle>Wastage Entries</SectionTitle>
          </>
        }
        renderItem={({ item, index }) => {
          const product = productMap[item.product_id];
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 25).duration(250)}>
              <Card style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{product?.name || `Product #${item.product_id}`}</Text>
                  <Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text>
                  <Text style={styles.meta}>Reason: {item.note || '-'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.qty}>
                    {Math.abs(item.quantity)} {product?.unit_of_measure || ''}
                  </Text>
                  <Text style={styles.cost}>Rs {costOf(item).toFixed(0)}</Text>
                </View>
              </Card>
            </Animated.View>
          );
        }}
        ListEmptyComponent={!loading && <EmptyState text="No wastage recorded yet." />}
      />
    </View>
  );
}

function FieldLabel({ children }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 12, paddingBottom: 40, gap: 10 },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 2 },
  statLabel: { fontSize: 12, color: colors.textMuted },
  filterCard: { gap: 6 },
  rowInputs: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.pillText, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  qty: { fontSize: 13, fontWeight: '600', color: colors.text },
  cost: { fontSize: 12, color: colors.danger, marginTop: 2 },
});
