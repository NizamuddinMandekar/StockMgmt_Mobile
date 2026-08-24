import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import DatePicker from '../components/DatePicker';
import ScreenHeader from '../components/ScreenHeader';
import SelectPicker from '../components/SelectPicker';
import { Button, Card, EmptyState, SectionTitle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { productsApi, stockApi, vendorsApi, warehousesApi } from '../services/api';
import { colors, radius } from '../theme';

const emptyFilters = { fromDate: '', toDate: '', productId: null, warehouseId: null, vendorId: null };

export default function StockHistoryScreen({ embedded = false } = {}) {
  const { activeBranchId } = useAuth();
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ ...emptyFilters, warehouseId: activeBranchId });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productList, warehouseList, movementList, vendorList] = await Promise.all([
        productsApi.list(),
        warehousesApi.list(),
        stockApi.movements(),
        vendorsApi.list(),
      ]);
      setProducts(productList);
      setWarehouses(warehouseList);
      setVendors(vendorList);
      setMovements(
        movementList.filter((m) => m.movement_type === 'in' || (m.movement_type === 'adjustment' && m.quantity > 0)),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const warehouseMap = Object.fromEntries(warehouses.map((w) => [w.id, w]));
  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v]));

  const handleReset = () => setFilters(emptyFilters);

  const filtered = useMemo(
    () =>
      movements
        .filter((m) => {
          if (filters.productId && m.product_id !== filters.productId) return false;
          if (filters.warehouseId && m.warehouse_id !== filters.warehouseId) return false;
          if (filters.vendorId && m.vendor_id !== filters.vendorId) return false;
          const createdDate = new Date(m.created_at);
          if (filters.fromDate && createdDate < new Date(filters.fromDate)) return false;
          if (filters.toDate && createdDate > new Date(`${filters.toDate}T23:59:59`)) return false;
          return true;
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [movements, filters],
  );

  const totalStockIn = movements.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
  const today = new Date().toDateString();
  const todaysMovements = movements.filter((m) => new Date(m.created_at).toDateString() === today);
  const todaysStockIn = todaysMovements.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
  const purchaseValue = movements.reduce(
    (sum, m) => sum + m.quantity * Number(productMap[m.product_id]?.purchase_price || 0),
    0,
  );

  return (
    <View style={styles.container}>
      {!embedded && <ScreenHeader title="Stock In History" />}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.flatContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <>
            <View style={styles.statRow}>
              <StatCard title="Total Stock In" value={Math.round(totalStockIn).toLocaleString()} subtitle="Units Received" />
              <StatCard title="Today's Stock In" value={Math.round(todaysStockIn).toLocaleString()} subtitle="Today's Entries" />
            </View>
            <StatCard
              title="Purchase Value"
              value={`Rs ${(Math.round(purchaseValue * 100) / 100).toLocaleString()}`}
              subtitle="Total Purchase"
              wide
            />

            <SectionTitle>Filter Stock In History</SectionTitle>
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
              <SelectPicker
                items={products.map((p) => ({ id: p.id, label: p.name }))}
                value={filters.productId}
                onChange={(id) => setFilters((f) => ({ ...f, productId: id }))}
                placeholder="All Items"
                title="Select Item"
              />

              <FieldLabel>Warehouse</FieldLabel>
              <SelectPicker
                items={warehouses.map((w) => ({ id: w.id, label: w.name }))}
                value={filters.warehouseId}
                onChange={(id) => setFilters((f) => ({ ...f, warehouseId: id }))}
                placeholder="All Warehouses"
                title="Select Warehouse"
              />

              <FieldLabel>Vendor</FieldLabel>
              <SelectPicker
                items={vendors.map((v) => ({ id: v.id, label: v.name }))}
                value={filters.vendorId}
                onChange={(id) => setFilters((f) => ({ ...f, vendorId: id }))}
                placeholder="All Vendors"
                title="Select Vendor"
              />

              <Button title="Reset" variant="outline" onPress={handleReset} style={{ marginTop: 10 }} />
            </Card>

            <SectionTitle>Stock In History</SectionTitle>
          </>
        }
        renderItem={({ item, index }) => {
          const product = productMap[item.product_id];
          const purchaseTotal = item.quantity * Number(product?.purchase_price || 0);
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 25).duration(250)} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{product?.name || `Product #${item.product_id}`}</Text>
                <Text style={styles.meta}>
                  {warehouseMap[item.warehouse_id]?.name || '-'}
                  {item.vendor_id ? ` · ${vendorMap[item.vendor_id]?.name || '-'}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {new Date(item.created_at).toLocaleString()}
                  {item.reference ? ` · Ref: ${item.reference}` : ''}
                  {item.note ? ` · ${item.note}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.qty}>
                  {item.quantity} {product?.unit_of_measure || ''}
                </Text>
                <Text style={styles.value}>Rs {purchaseTotal.toLocaleString()}</Text>
              </View>
            </Animated.View>
          );
        }}
        ListEmptyComponent={!loading && <EmptyState text="No stock movements yet." />}
      />
    </View>
  );
}

function StatCard({ title, value, subtitle, wide }) {
  return (
    <View style={[styles.statCard, wide && styles.statCardWide]}>
      <Card>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statSubtitle}>{subtitle}</Text>
      </Card>
    </View>
  );
}

function FieldLabel({ children }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 10,
  },
  flatContent: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
  },
  statCardWide: {
    flex: undefined,
  },
  statTitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  statSubtitle: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
  },
  filterCard: {
    gap: 6,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.pillText,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: colors.card,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  qty: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  value: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
});
