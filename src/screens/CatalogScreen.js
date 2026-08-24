import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import DatePicker from '../components/DatePicker';
import ScreenHeader from '../components/ScreenHeader';
import SearchBar from '../components/SearchBar';
import SelectPicker from '../components/SelectPicker';
import { Button, Card, EmptyState, Input, Pill } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { categoriesApi, productsApi, stockApi, unitsApi, vendorsApi } from '../services/api';
import { colors, radius } from '../theme';

const STATUS_TONE = { 'In Stock': 'success', 'Low Stock': 'warning', 'Out of Stock': 'danger' };
const STATUS_FILTERS = ['all', 'In Stock', 'Low Stock', 'Out of Stock'];
const EXPIRY_SOON_DAYS = 7;

// Matches web's stock-management.js getExpiryStatus exactly.
function getExpiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  const daysLeft = Math.round((expiry - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= EXPIRY_SOON_DAYS) return 'Expiring Soon';
  return null;
}

const emptyForm = () => ({
  name: '',
  categoryId: null,
  unit: '',
  openingStock: '',
  minStock: '',
  vendorId: null,
  expiryDate: '',
});

export default function CatalogScreen() {
  const { activeBranchId } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [stockByProduct, setStockByProduct] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm());

  const [viewingItem, setViewingItem] = useState(null);
  const [viewTab, setViewTab] = useState('overview');
  const [movements, setMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [productList, categoryList, vendorList, unitList, levels] = await Promise.all([
        productsApi.list(),
        categoriesApi.list(),
        vendorsApi.list({ is_active: true }),
        unitsApi.list({ is_active: true }),
        stockApi.levels(),
      ]);
      setProducts(productList);
      setCategories(categoryList);
      setVendors(vendorList);
      setUnits(unitList);
      const byProduct = {};
      levels
        .filter((l) => l.warehouse_id === activeBranchId)
        .forEach((l) => {
          byProduct[l.product_id] = (byProduct[l.product_id] || 0) + Number(l.quantity || 0);
        });
      setStockByProduct(byProduct);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));

  const rows = useMemo(
    () =>
      products.map((p) => {
        const currentStock = stockByProduct[p.id] || 0;
        const status = currentStock <= 0 ? 'Out of Stock' : currentStock <= p.min_stock ? 'Low Stock' : 'In Stock';
        return { ...p, currentStock, status, expiryStatus: getExpiryStatus(p.expiry_date) };
      }),
    [products, stockByProduct],
  );

  const filtered = rows.filter((r) => {
    if (categoryFilter && r.category_id !== categoryFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isFormValid = form.name.trim() && form.categoryId && form.unit && (editingId || form.openingStock);

  const handleReset = () => setForm(emptyForm());

  const handleOpenAdd = () => {
    setEditingId(null);
    handleReset();
    setShowForm(true);
  };

  const handleOpenEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      categoryId: item.category_id,
      unit: item.unit_of_measure,
      openingStock: String(item.currentStock ?? ''),
      minStock: item.min_stock ? String(item.min_stock) : '',
      vendorId: item.vendor_id || null,
      expiryDate: item.expiry_date || '',
    });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    handleReset();
  };

  const handleSave = async () => {
    if (!isFormValid) {
      Alert.alert('Missing fields', 'Please fill all required fields.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const original = rows.find((r) => r.id === editingId);
        await productsApi.update(editingId, {
          name: form.name.trim(),
          category_id: form.categoryId,
          unit_of_measure: form.unit,
          min_stock: Number(form.minStock || 0),
          vendor_id: form.vendorId,
          expiry_date: form.expiryDate || null,
        });

        // Editing "Current Stock" directly applies the difference as a
        // manual adjustment, matching web's handleUpdateStock.
        const newQty = Number(form.openingStock || 0);
        const delta = newQty - (original?.currentStock || 0);
        if (delta !== 0) {
          await stockApi.adjust({
            product_id: editingId,
            warehouse_id: activeBranchId,
            quantity: delta,
            note: 'Manual stock edit',
          });
        }
      } else {
        const itemCode = `ITM-${Math.floor(1000 + Math.random() * 9000)}`;
        const product = await productsApi.create({
          sku: itemCode,
          name: form.name.trim(),
          category_id: form.categoryId,
          unit_of_measure: form.unit,
          purchase_price: 0,
          min_stock: Number(form.minStock || 0),
          vendor_id: form.vendorId,
          expiry_date: form.expiryDate || null,
        });

        const opening = Number(form.openingStock);
        if (opening > 0) {
          await stockApi.adjust({
            product_id: product.id,
            warehouse_id: activeBranchId,
            quantity: opening,
            movement_type: 'in',
            note: 'Opening stock',
          });
        }
      }

      handleCloseForm();
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not save item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    // Matches web's stock-management.js handleDelete wording exactly.
    Alert.alert(item.name, 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await productsApi.remove(item.id);
            await load();
          } catch (err) {
            Alert.alert('Failed', err.message || 'Could not delete item.');
          }
        },
      },
    ]);
  };

  const handleView = (item) => {
    setViewingItem(item);
    setViewTab('overview');
    setMovements([]);
    setMovementsLoading(true);
    stockApi
      .movements({ product_id: item.id })
      .then(setMovements)
      .finally(() => setMovementsLoading(false));
  };

  const handleCloseView = () => {
    setViewingItem(null);
    setMovements([]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Product Master" />
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Button
              title={showForm ? 'Cancel' : '+ Add Item'}
              variant={showForm ? 'outline' : 'primary'}
              onPress={() => (showForm ? handleCloseForm() : handleOpenAdd())}
              style={{ marginBottom: 12 }}
            />
            {showForm && (
              <Card style={styles.form}>
                <FieldLabel required>Category</FieldLabel>
                <SelectPicker
                  items={categories.map((c) => ({ id: c.id, label: c.name }))}
                  value={form.categoryId}
                  onChange={(id) => setForm((f) => ({ ...f, categoryId: id, name: editingId ? f.name : '' }))}
                  placeholder="Select Category"
                  title="Select Category"
                />

                <FieldLabel required>Item Name</FieldLabel>
                <Input
                  placeholder={form.categoryId ? 'Type item name...' : 'Select a category first'}
                  editable={!!form.categoryId}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                />

                <FieldLabel required>Unit</FieldLabel>
                <SelectPicker
                  items={units.map((u) => ({ id: u.name, label: u.name }))}
                  value={form.unit}
                  onChange={(name) => setForm((f) => ({ ...f, unit: name }))}
                  placeholder="Select unit..."
                  title="Select Unit"
                />

                <FieldLabel required={!editingId}>{editingId ? 'Current Stock' : 'Opening Stock'}</FieldLabel>
                <Input
                  placeholder="0"
                  keyboardType="numeric"
                  value={form.openingStock}
                  onChangeText={(v) => setForm((f) => ({ ...f, openingStock: v }))}
                />
                {editingId ? (
                  <Text style={styles.helperText}>Changing this applies the difference as a manual stock adjustment.</Text>
                ) : null}

                <FieldLabel>Low Stock Alert</FieldLabel>
                <Input
                  placeholder="e.g. 5"
                  keyboardType="numeric"
                  value={form.minStock}
                  onChangeText={(v) => setForm((f) => ({ ...f, minStock: v }))}
                />
                <Text style={styles.helperText}>Get flagged when stock falls to this level or below.</Text>

                <FieldLabel>Vendor (optional)</FieldLabel>
                <SelectPicker
                  items={vendors.map((v) => ({ id: v.id, label: v.name }))}
                  value={form.vendorId}
                  onChange={(id) => setForm((f) => ({ ...f, vendorId: id }))}
                  placeholder="Select vendor..."
                  title="Select Vendor"
                />

                <FieldLabel>Expiry Date (optional)</FieldLabel>
                <DatePicker value={form.expiryDate} onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))} mode="date" />

                <View style={styles.formActions}>
                  <Button
                    title={editingId ? 'Cancel' : 'Reset'}
                    variant="outline"
                    onPress={editingId ? handleCloseForm : handleReset}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={editingId ? 'Update Item' : 'Save Item'}
                    onPress={handleSave}
                    loading={saving}
                    disabled={!isFormValid}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            )}

            <SearchBar placeholder="Search products..." value={search} onChangeText={setSearch} style={{ marginBottom: 12 }} />
            <View style={styles.chipRow}>
              {STATUS_FILTERS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStatusFilter(s)}
                  style={[styles.chip, statusFilter === s && styles.chipActive]}
                >
                  <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 25).duration(250)}>
            <Card style={styles.row}>
              <Pressable style={{ flex: 1 }} onPress={() => handleView(item)}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.sku ? `${item.sku} · ` : ''}
                  {categoryMap[item.category_id] || 'Uncategorized'} · {item.currentStock} {item.unit_of_measure}
                </Text>
              </Pressable>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Pill label={item.status} tone={STATUS_TONE[item.status]} />
                <View style={styles.actionRow}>
                  <Pressable onPress={() => handleView(item)} hitSlop={6}>
                    <Ionicons name="eye-outline" size={19} color={colors.text} />
                  </Pressable>
                  <Pressable onPress={() => handleOpenEdit(item)} hitSlop={6}>
                    <Ionicons name="create-outline" size={19} color={colors.ink} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(item)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={19} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            </Card>
          </Animated.View>
        )}
        ListEmptyComponent={!loading && <EmptyState text="No products yet." />}
      />

      <Modal visible={!!viewingItem} animationType="slide" onRequestClose={handleCloseView}>
        <View style={styles.container}>
          <ScreenHeader title={viewingItem?.name || 'Item Details'} />
          {viewingItem && (
            <ScrollView contentContainerStyle={styles.viewContent}>
              <View style={styles.viewHeaderRow}>
                <View>
                  <Text style={styles.viewCode}>{viewingItem.sku || '-'}</Text>
                  <Pill label={viewingItem.status} tone={STATUS_TONE[viewingItem.status]} />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.helperText}>Current Stock</Text>
                  <Text style={styles.viewStockValue}>
                    {viewingItem.currentStock} {viewingItem.unit_of_measure}
                  </Text>
                </View>
              </View>

              <View style={styles.chipRow}>
                {['overview', 'history'].map((t) => (
                  <Pressable key={t} onPress={() => setViewTab(t)} style={[styles.chip, viewTab === t && styles.chipActive]}>
                    <Text style={[styles.chipText, viewTab === t && styles.chipTextActive]}>
                      {t === 'overview' ? 'Overview' : 'Stock History'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {viewTab === 'overview' ? (
                <>
                  <Card style={styles.detailCard}>
                    <Text style={styles.detailCardTitle}>Item Information</Text>
                    <DetailRow label="Item Code" value={viewingItem.sku} />
                    <DetailRow label="Item Name" value={viewingItem.name} />
                    <DetailRow label="Category" value={categoryMap[viewingItem.category_id]} />
                    <DetailRow label="Vendor" value={vendorMap[viewingItem.vendor_id]} />
                    <DetailRow label="Unit" value={viewingItem.unit_of_measure} />
                  </Card>

                  <Card style={styles.detailCard}>
                    <Text style={styles.detailCardTitle}>Stock Information</Text>
                    <DetailRow label="Current Stock" value={`${viewingItem.currentStock} ${viewingItem.unit_of_measure}`} />
                    <DetailRow label="Low Stock Alert" value={`${viewingItem.min_stock || 0} ${viewingItem.unit_of_measure}`} />
                    <DetailRow
                      label="Expiry Date"
                      value={viewingItem.expiry_date || 'Not set'}
                      danger={viewingItem.expiryStatus === 'Expired'}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Pill label={viewingItem.status} tone={STATUS_TONE[viewingItem.status]} />
                      {viewingItem.expiryStatus && (
                        <Pill
                          label={viewingItem.expiryStatus}
                          tone={viewingItem.expiryStatus === 'Expired' ? 'danger' : 'warning'}
                        />
                      )}
                    </View>
                  </Card>
                </>
              ) : movementsLoading ? (
                <Text style={styles.helperText}>Loading...</Text>
              ) : movements.length === 0 ? (
                <EmptyState text="No transactions yet" />
              ) : (
                movements
                  .slice()
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .map((m) => {
                    const isIn = m.movement_type === 'in' || (m.movement_type === 'adjustment' && m.quantity > 0);
                    const isWastage = m.movement_type === 'wastage';
                    const typeLabel = isWastage ? 'Wastage' : isIn ? 'Stock In' : 'Stock Out';
                    const typeTone = isWastage ? 'warning' : isIn ? 'success' : 'danger';
                    return (
                      <Card key={m.id} style={styles.txnRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{new Date(m.created_at).toLocaleDateString()}</Text>
                          <Text style={styles.meta}>{m.reference || m.note || '-'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Pill label={typeLabel} tone={typeTone} />
                          <Text style={styles.txnQty}>
                            {isIn ? '+' : '-'}
                            {Math.abs(m.quantity)}
                          </Text>
                        </View>
                      </Card>
                    );
                  })
              )}

              <Button title="Close" variant="outline" onPress={handleCloseView} style={{ marginTop: 16 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

function FieldLabel({ children, required }) {
  return (
    <Text style={styles.fieldLabel}>
      {children}
      {required && <Text style={styles.requiredMark}> *</Text>}
    </Text>
  );
}

function DetailRow({ label, value, danger }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, danger && { color: colors.danger }]}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 12, paddingBottom: 40, gap: 10 },
  form: { gap: 6, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.pillText, marginTop: 6 },
  requiredMark: { color: colors.danger },
  helperText: { fontSize: 11, color: colors.textMuted, marginTop: -2 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  rowInputs: { flexDirection: 'row', gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.pill },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.pillText },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  viewContent: { padding: 16, paddingBottom: 40, gap: 10 },
  viewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  viewCode: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  viewStockValue: { fontSize: 18, fontWeight: '700', color: colors.ink },
  detailCard: { gap: 4, padding: 14 },
  detailCardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 13, color: colors.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  txnQty: { fontSize: 13, fontWeight: '700', color: colors.text },
});
