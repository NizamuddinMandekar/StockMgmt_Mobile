import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import ProductPicker from '../components/ProductPicker';
import ScreenHeader from '../components/ScreenHeader';
import SelectPicker from '../components/SelectPicker';
import { Button, Card, EmptyState, Input, Pill } from '../components/ui';
import { procurementApi, productsApi, unitsApi, vendorsApi } from '../services/api';
import { exportCsv, exportPdf, rowsToCsv } from '../utils/exportFile';
import { fromBaseQuantity, getEntryUnitOptions, getSubUnit, toBaseQuantity } from '../services/unitConversion';
import { colors } from '../theme';

// Matches web's procurement-request.js EXPORT_HEADERS / toExportRows /
// exportRequestsCsv / exportRequestsPdf exactly (one group at a time).
const EXPORT_HEADERS = ['Request', 'Item', 'Vendor', 'Quantity', 'Urgency', 'Note', 'Requested On'];

function formatQuantity(baseQty, baseUnit, units) {
  const subUnit = getSubUnit(baseUnit, units);
  if (subUnit && baseQty < 1) {
    return `${fromBaseQuantity(baseQty, subUnit, baseUnit, units)} ${subUnit}`;
  }
  return `${Number(baseQty.toFixed(3))} ${baseUnit}`;
}

function toExportRows(rows, productMap, vendorMap, units) {
  return rows.map((r) => [
    r.request_number,
    productMap[r.product_id]?.name || '-',
    vendorMap[r.vendor_id] || '-',
    formatQuantity(Number(r.quantity), productMap[r.product_id]?.unit_of_measure || '', units),
    r.urgency,
    r.note || '-',
    new Date(r.created_at).toLocaleString(),
  ]);
}

function exportRowsToHtml(rows) {
  const head = EXPORT_HEADERS.map((h) => `<th>${h}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('');
  return `<html><head><meta charset="utf-8" /><style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 16px; }
    h1 { font-size: 16px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
    th { background: #f4f4f5; }
  </style></head><body>
    <h1>Procurement Requests</h1>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </body></html>`;
}

const STATUS_TONE = { pending: 'warning', fulfilled: 'success', cancelled: 'danger' };
const URGENCIES = [
  { value: 'low', tone: 'default' },
  { value: 'normal', tone: 'default' },
  { value: 'high', tone: 'warning' },
  { value: 'urgent', tone: 'danger' },
];

const emptyDraft = { productId: null, entryUnit: '', quantity: '', urgency: 'normal', note: '' };
const emptyEditForm = () => ({ id: null, vendorId: null, unit: '', entryUnit: '', quantity: '', urgency: 'normal', note: '' });

export default function ProcurementScreen() {
  const [requests, setRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [vendorId, setVendorId] = useState(null);
  const [cart, setCart] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);

  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm());
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    try {
      const [requestList, productList, vendorList, unitList] = await Promise.all([
        procurementApi.list(),
        productsApi.list({ is_active: true }),
        vendorsApi.list({ is_active: true }),
        unitsApi.list({ is_active: true }),
      ]);
      setRequests(requestList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setProducts(productList);
      setVendors(vendorList);
      setUnits(unitList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const vendorMap = useMemo(() => Object.fromEntries(vendors.map((v) => [v.id, v.name])), [vendors]);
  const draftProduct = draft.productId ? productMap[draft.productId] : null;
  const entryUnitOptions = draftProduct ? getEntryUnitOptions(draftProduct.unit_of_measure, units) : [];
  const editEntryUnitOptions = editForm.unit ? getEntryUnitOptions(editForm.unit, units) : [];

  // Main FlatList data - grouping+sorting every request on every render
  // (e.g. every keystroke while filling in the new-request form) was
  // expensive once there was real request history.
  const grouped = useMemo(
    () =>
      Object.values(
        requests.reduce((acc, r) => {
          const key = r.request_number;
          if (!acc[key]) {
            acc[key] = { request_number: key, created_at: r.created_at, vendor_id: r.vendor_id, items: [] };
          }
          acc[key].items.push(r);
          acc[key].status = acc[key].items.every((i) => i.status === 'fulfilled') ? 'fulfilled' : 'pending';
          return acc;
        }, {}),
      ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [requests],
  );

  const handleSelectProduct = (id) => {
    const product = productMap[id];
    setDraft((d) => ({ ...d, productId: id, entryUnit: product.unit_of_measure, quantity: '' }));
    if (!vendorId && product.vendor_id) setVendorId(product.vendor_id);
  };

  const addToCart = () => {
    const qty = Number(draft.quantity);
    if (!draftProduct || !qty || qty <= 0) {
      Alert.alert('Invalid item', 'Select a product and enter a valid quantity.');
      return;
    }
    setCart((prev) => [...prev, { ...draft, id: Date.now(), productName: draftProduct.name }]);
    setDraft(emptyDraft);
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  const handleExportCsv = async (group) => {
    try {
      const rows = toExportRows(group.items, productMap, vendorMap, units);
      await exportCsv(`procurement-${group.request_number}.csv`, rowsToCsv([EXPORT_HEADERS, ...rows]));
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not export CSV.');
    }
  };

  const handleExportPdf = async (group) => {
    try {
      const rows = toExportRows(group.items, productMap, vendorMap, units);
      await exportPdf(`procurement-${group.request_number}.pdf`, exportRowsToHtml(rows));
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not export PDF.');
    }
  };

  const handleCreate = async () => {
    if (!vendorId) {
      Alert.alert('Missing vendor', 'Select a vendor for this request.');
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Empty', 'Add at least one item.');
      return;
    }
    setSaving(true);
    try {
      await procurementApi.createBatch(
        cart.map((item) => {
          const product = productMap[item.productId];
          return {
            product_id: item.productId,
            vendor_id: vendorId,
            quantity: toBaseQuantity(item.quantity, item.entryUnit, product.unit_of_measure, units),
            urgency: item.urgency,
            note: item.note || null,
          };
        }),
      );
      setCart([]);
      setVendorId(null);
      setShowForm(false);
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not create request.');
    } finally {
      setSaving(false);
    }
  };

  // Item details (vendor/quantity/urgency) can only be edited on a still-
  // pending line - matches the API's rule (procurement.py update_request)
  // and web's procurement-request.js openEdit/itemColumns Action, which
  // only show the pencil for row.status === 'pending'.
  const openEdit = (row) => {
    const unit = productMap[row.product_id]?.unit_of_measure || '';
    setEditingItem(row);
    setEditForm({
      id: row.id,
      vendorId: row.vendor_id || null,
      unit,
      entryUnit: unit,
      quantity: String(row.quantity),
      urgency: row.urgency,
      note: row.note || '',
    });
  };

  const closeEdit = () => {
    setEditingItem(null);
    setEditForm(emptyEditForm());
  };

  const handleSaveEdit = async () => {
    const qty = Number(editForm.quantity);
    if (!qty || qty <= 0) {
      Alert.alert('Invalid quantity', 'Enter a valid quantity.');
      return;
    }
    if (!editForm.vendorId) {
      Alert.alert('Missing vendor', 'Select a vendor.');
      return;
    }
    setSavingEdit(true);
    try {
      await procurementApi.update(editForm.id, {
        vendor_id: editForm.vendorId,
        quantity: toBaseQuantity(qty, editForm.entryUnit, editForm.unit, units),
        urgency: editForm.urgency,
        note: editForm.note || null,
      });
      closeEdit();
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not update request item.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteRequest = (group) => {
    Alert.alert(
      'Delete entire request',
      `Remove all ${group.items.length} item${group.items.length === 1 ? '' : 's'} in request #${group.request_number}? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all(group.items.map((r) => procurementApi.remove(r.id)));
              await load();
            } catch (err) {
              Alert.alert('Failed', err.message || 'Could not delete request.');
            }
          },
        },
      ],
    );
  };

  const handleDelete = (row) => {
    Alert.alert(
      'Delete item',
      `Remove this item from request #${row.request_number}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await procurementApi.remove(row.id);
              await load();
            } catch (err) {
              Alert.alert('Failed', err.message || 'Could not delete request item.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Procurement Request" />
      <FlatList
        data={grouped}
        keyExtractor={(item) => item.request_number}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Button
              title={showForm ? 'Cancel' : '+ New Request'}
              variant={showForm ? 'outline' : 'primary'}
              onPress={() => setShowForm((v) => !v)}
              style={{ marginBottom: 12 }}
            />
            {showForm && (
              <Card style={styles.form}>
                <Text style={styles.formTitle}>Vendor</Text>
                <SelectPicker
                  items={vendors.map((v) => ({ id: v.id, label: v.name }))}
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder="Select vendor *"
                  title="Select Vendor"
                />

                <Text style={styles.formTitle}>Add Item</Text>
                <ProductPicker products={products} value={draft.productId} onChange={handleSelectProduct} />
                {draftProduct && entryUnitOptions.length > 1 && (
                  <View style={styles.chipRow}>
                    {entryUnitOptions.map((u) => (
                      <Pressable
                        key={u}
                        onPress={() => setDraft((d) => ({ ...d, entryUnit: u }))}
                        style={[styles.chip, draft.entryUnit === u && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, draft.entryUnit === u && styles.chipTextActive]}>{u}</Text>
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
                <Text style={styles.label}>Urgency</Text>
                <View style={styles.chipRow}>
                  {URGENCIES.map((u) => (
                    <Pressable
                      key={u.value}
                      onPress={() => setDraft((d) => ({ ...d, urgency: u.value }))}
                      style={[styles.chip, draft.urgency === u.value && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, draft.urgency === u.value && styles.chipTextActive]}>{u.value}</Text>
                    </Pressable>
                  ))}
                </View>
                <Input
                  placeholder="Note (optional)"
                  value={draft.note}
                  onChangeText={(v) => setDraft((d) => ({ ...d, note: v }))}
                />
                <Button title="+ Add Item" variant="outline" onPress={addToCart} />

                {cart.length > 0 && (
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {cart.map((item) => (
                      <View key={item.id} style={styles.cartRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cartText}>
                            {item.productName} · {item.quantity} {item.entryUnit}
                          </Text>
                          <Text style={styles.cartMeta}>
                            {item.urgency}
                            {item.note ? ` · ${item.note}` : ''}
                          </Text>
                        </View>
                        <Pressable onPress={() => removeFromCart(item.id)}>
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      </View>
                    ))}
                    <Button title="Submit Request" onPress={handleCreate} loading={saving} />
                  </View>
                )}
              </Card>
            )}
          </>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 30).duration(250)}>
            <Card style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.reqNumber}>#{item.request_number}</Text>
                <Pill label={item.status} tone={STATUS_TONE[item.status] || 'default'} />
              </View>
              <View style={styles.exportRow}>
                <Text style={styles.vendorLine}>{vendorMap[item.vendor_id] || 'No vendor'}</Text>
                <View style={styles.exportButtons}>
                  <Pressable onPress={() => handleExportCsv(item)} style={styles.exportBtn} hitSlop={6}>
                    <Ionicons name="document-text-outline" size={13} color={colors.pillText} />
                    <Text style={styles.exportBtnText}>CSV</Text>
                  </Pressable>
                  <Pressable onPress={() => handleExportPdf(item)} style={styles.exportBtn} hitSlop={6}>
                    <Ionicons name="document-outline" size={13} color={colors.pillText} />
                    <Text style={styles.exportBtnText}>PDF</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDeleteRequest(item)} style={styles.exportBtn} hitSlop={6}>
                    <Ionicons name="trash-outline" size={13} color={colors.danger} />
                    <Text style={[styles.exportBtnText, { color: colors.danger }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
              {item.items.map((r) => (
                <View key={r.id} style={styles.itemRow}>
                  <Text style={styles.itemLine}>
                    {productMap[r.product_id]?.name || `Product #${r.product_id}`} — {r.quantity}{' '}
                    {productMap[r.product_id]?.unit_of_measure || ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </Text>
                  <View style={styles.itemRight}>
                    <View style={styles.itemPills}>
                      <Pill label={r.status} tone={STATUS_TONE[r.status] || 'default'} />
                      <Pill
                        label={r.urgency}
                        tone={URGENCIES.find((u) => u.value === r.urgency)?.tone || 'default'}
                      />
                    </View>
                    {r.status === 'pending' && (
                      <View style={styles.itemActions}>
                        <Pressable onPress={() => openEdit(r)} hitSlop={8}>
                          <Ionicons name="pencil-outline" size={16} color={colors.pillText} />
                        </Pressable>
                        <Pressable onPress={() => handleDelete(r)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </Card>
          </Animated.View>
        )}
        ListEmptyComponent={!loading && <EmptyState text="No procurement requests yet." />}
      />

      <Modal visible={!!editingItem} animationType="slide" onRequestClose={closeEdit}>
        <View style={styles.modal}>
          <ScreenHeader title="Edit Request Item" />
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.formTitle}>Item</Text>
            <Input value={editingItem ? productMap[editingItem.product_id]?.name || '-' : ''} editable={false} />

            <Text style={styles.formTitle}>Vendor</Text>
            <SelectPicker
              items={vendors.map((v) => ({ id: v.id, label: v.name }))}
              value={editForm.vendorId}
              onChange={(v) => setEditForm((f) => ({ ...f, vendorId: v }))}
              placeholder="Select vendor *"
              title="Select Vendor"
            />

            {editEntryUnitOptions.length > 1 && (
              <View style={styles.chipRow}>
                {editEntryUnitOptions.map((u) => (
                  <Pressable
                    key={u}
                    onPress={() => setEditForm((f) => ({ ...f, entryUnit: u }))}
                    style={[styles.chip, editForm.entryUnit === u && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, editForm.entryUnit === u && styles.chipTextActive]}>{u}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Input
              placeholder="Quantity"
              keyboardType="numeric"
              value={editForm.quantity}
              onChangeText={(v) => setEditForm((f) => ({ ...f, quantity: v }))}
            />

            <Text style={styles.label}>Urgency</Text>
            <View style={styles.chipRow}>
              {URGENCIES.map((u) => (
                <Pressable
                  key={u.value}
                  onPress={() => setEditForm((f) => ({ ...f, urgency: u.value }))}
                  style={[styles.chip, editForm.urgency === u.value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, editForm.urgency === u.value && styles.chipTextActive]}>
                    {u.value}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Input
              placeholder="Note (optional)"
              value={editForm.note}
              onChangeText={(v) => setEditForm((f) => ({ ...f, note: v }))}
            />

            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={closeEdit} style={{ flex: 1 }} />
              <Button title="Save Changes" onPress={handleSaveEdit} loading={savingEdit} style={{ flex: 1 }} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 12, paddingBottom: 40, gap: 10 },
  form: { gap: 10, marginBottom: 12 },
  formTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.pillText },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.pill },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.pillText, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  cartText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  cartMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  removeText: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  row: { padding: 14, gap: 6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reqNumber: { fontSize: 14, fontWeight: '700', color: colors.text },
  vendorLine: { fontSize: 12, color: colors.textMuted },
  exportRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exportButtons: { flexDirection: 'row', gap: 8 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportBtnText: { fontSize: 11, fontWeight: '600', color: colors.pillText },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemPills: { flexDirection: 'row', gap: 6 },
  itemActions: { flexDirection: 'row', gap: 10 },
  itemLine: { fontSize: 13, color: colors.text, flex: 1 },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalContent: { padding: 16, paddingTop: 12, gap: 10, paddingBottom: 40 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
