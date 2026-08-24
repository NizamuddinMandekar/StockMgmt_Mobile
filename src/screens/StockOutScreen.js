import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import ProductPicker from '../components/ProductPicker';
import ScreenHeader from '../components/ScreenHeader';
import SelectPicker from '../components/SelectPicker';
import { Button, Card, EmptyState, Input, Pill, SectionTitle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { departmentsApi, productsApi, stockApi, unitsApi } from '../services/api';
import { getEntryUnitOptions, toBaseQuantity } from '../services/unitConversion';
import { colors } from '../theme';

const REASONS = ['Used in Kitchen', 'Wastage - Expired', 'Wastage - Damaged', 'Wastage - Spilled', 'Wastage - Other'];

const emptyDraft = { productId: null, entryUnit: '', quantity: '', reason: REASONS[0], departmentId: null };

export default function StockOutScreen({ embedded = false } = {}) {
  const { activeBranchId } = useAuth();
  const [products, setProducts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [units, setUnits] = useState([]);
  const [stockByProduct, setStockByProduct] = useState({});
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cart, setCart] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);

  const load = useCallback(async () => {
    try {
      const [productList, departmentList, unitList, levels, movementList] = await Promise.all([
        productsApi.list({ is_active: true }),
        departmentsApi.list({ is_active: true }),
        unitsApi.list({ is_active: true }),
        stockApi.levels(),
        stockApi.movements(),
      ]);
      setProducts(productList);
      setDepartments(departmentList);
      setUnits(unitList);

      const byProduct = {};
      levels
        .filter((l) => l.warehouse_id === activeBranchId)
        .forEach((l) => {
          byProduct[l.product_id] = (byProduct[l.product_id] || 0) + Number(l.quantity || 0);
        });
      setStockByProduct(byProduct);

      setMovements(
        movementList
          .filter((m) => m.warehouse_id === activeBranchId && (m.movement_type === 'out' || m.movement_type === 'wastage'))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 15),
      );
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const departmentMap = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d.name])), [departments]);
  const draftProduct = draft.productId ? productMap[draft.productId] : null;
  const entryUnitOptions = draftProduct ? getEntryUnitOptions(draftProduct.unit_of_measure, units) : [];
  const availableStock = draft.productId ? stockByProduct[draft.productId] || 0 : 0;

  const handleSelectProduct = (id) => {
    const product = productMap[id];
    setDraft((d) => ({ ...d, productId: id, entryUnit: product.unit_of_measure, quantity: '' }));
  };

  const handleAddToCart = () => {
    const qty = Number(draft.quantity);
    if (!draftProduct || !qty || qty <= 0) {
      Alert.alert('Invalid item', 'Select a product and enter a valid quantity.');
      return;
    }
    const baseQty = toBaseQuantity(draft.quantity, draft.entryUnit, draftProduct.unit_of_measure, units);
    if (baseQty > availableStock) {
      Alert.alert('Insufficient stock', `Only ${availableStock} ${draftProduct.unit_of_measure} available.`);
      return;
    }
    setCart((prev) => [...prev, { ...draft, id: Date.now(), productName: draftProduct.name }]);
    setDraft(emptyDraft);
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  const handleReset = () => {
    setCart([]);
    setDraft(emptyDraft);
  };

  const handleSubmit = () => {
    if (cart.length === 0) {
      Alert.alert('Empty', 'Add at least one item.');
      return;
    }
    Alert.alert('Save Stock Out', 'Do you want to save this Stock Out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: confirmSubmit },
    ]);
  };

  const confirmSubmit = async () => {
    setSaving(true);
    try {
      await Promise.all(
        cart.map((item) => {
          const product = productMap[item.productId];
          const baseQty = toBaseQuantity(item.quantity, item.entryUnit, product.unit_of_measure, units);
          return stockApi.adjust({
            product_id: item.productId,
            warehouse_id: activeBranchId,
            quantity: -baseQty,
            movement_type: item.reason.startsWith('Wastage') ? 'wastage' : 'out',
            note: item.reason,
            reference: departmentMap[item.departmentId] || null,
          });
        }),
      );
      setCart([]);
      await load();
      Alert.alert('Saved', 'Stock Out entry recorded.');
    } catch (err) {
      Alert.alert('Failed', err.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {!embedded && <ScreenHeader title="Stock Out" />}
      <FlatList
        data={movements}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.flatContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <>
            <Card style={styles.form}>
              <Text style={styles.formTitle}>Add Item</Text>
              <ProductPicker products={products} value={draft.productId} onChange={handleSelectProduct} />
              {draftProduct && (
                <Text style={styles.availableText}>
                  Available: {availableStock} {draftProduct.unit_of_measure}
                </Text>
              )}
              {draftProduct && entryUnitOptions.length > 1 && (
                <View style={styles.unitRow}>
                  {entryUnitOptions.map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => setDraft((d) => ({ ...d, entryUnit: u }))}
                      style={[styles.unitChip, draft.entryUnit === u && styles.unitChipActive]}
                    >
                      <Text style={[styles.unitChipText, draft.entryUnit === u && styles.unitChipTextActive]}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Input
                placeholder="Quantity"
                keyboardType="numeric"
                value={draft.quantity}
                onChangeText={(v) => setDraft((d) => ({ ...d, quantity: v }))}
              />
              {departments.length > 0 && (
                <SelectPicker
                  items={departments.map((d) => ({ id: d.id, label: d.name }))}
                  value={draft.departmentId}
                  onChange={(id) => setDraft((d) => ({ ...d, departmentId: id }))}
                  placeholder="Select Department"
                  title="Select Department"
                />
              )}
              <View style={styles.unitRow}>
                {REASONS.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setDraft((d) => ({ ...d, reason: r }))}
                    style={[styles.reasonChip, draft.reason === r && styles.unitChipActive]}
                  >
                    <Text style={[styles.unitChipText, draft.reason === r && styles.unitChipTextActive]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
              <Button title="+ Add Item" variant="outline" onPress={handleAddToCart} />
            </Card>

            {cart.length > 0 && (
              <Card style={styles.form}>
                <Text style={styles.formTitle}>Items ({cart.length})</Text>
                {cart.map((item) => (
                  <View key={item.id} style={styles.cartRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartName}>{item.productName}</Text>
                      <Text style={styles.cartMeta}>
                        {item.quantity} {item.entryUnit} · {item.reason}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeFromCart(item.id)}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
                <View style={styles.actionsRow}>
                  <Button title="Reset" variant="outline" onPress={handleReset} style={{ flex: 1 }} />
                  <Button title="Save Stock Out" onPress={handleSubmit} loading={saving} style={{ flex: 1 }} />
                </View>
              </Card>
            )}

            <SectionTitle>Recent Stock Out</SectionTitle>
          </>
        }
        renderItem={({ item, index }) => {
          const product = productMap[item.product_id];
          return (
            <Animated.View entering={FadeInDown.delay(index * 30).duration(250)} style={styles.movementRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.movementName}>{product?.name || `Product #${item.product_id}`}</Text>
                <Text style={styles.movementMeta}>
                  {new Date(item.created_at).toLocaleString()}
                  {item.note ? ` · ${item.note}` : ''}
                </Text>
              </View>
              <Pill label={`${Math.abs(item.quantity)} ${product?.unit_of_measure || ''}`} tone={item.movement_type === 'wastage' ? 'danger' : 'warning'} />
            </Animated.View>
          );
        }}
        ListEmptyComponent={!loading && <EmptyState text="No Stock Out entries yet." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 12, paddingBottom: 40, gap: 10 },
  flatContent: { padding: 16, paddingTop: 12, paddingBottom: 40 },
  separator: { height: 1, backgroundColor: colors.border },
  form: { gap: 10, marginBottom: 12 },
  formTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  availableText: { fontSize: 12, color: colors.textMuted },
  actionsRow: { flexDirection: 'row', gap: 10 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.pill },
  reasonChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.pill },
  unitChipActive: { backgroundColor: colors.ink },
  unitChipText: { fontSize: 12, fontWeight: '600', color: colors.pillText },
  unitChipTextActive: { color: '#fff' },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cartName: { fontSize: 14, fontWeight: '600', color: colors.text },
  cartMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  removeText: { fontSize: 13, color: colors.danger, fontWeight: '600' },
  movementRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: colors.card },
  movementName: { fontSize: 14, fontWeight: '600', color: colors.text },
  movementMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
