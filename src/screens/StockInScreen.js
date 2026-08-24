import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import DatePicker from '../components/DatePicker';
import ProductPicker from '../components/ProductPicker';
import ScreenHeader from '../components/ScreenHeader';
import SelectPicker from '../components/SelectPicker';
import { Button, Card, EmptyState, Input, Pill, SectionTitle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { paymentsApi, procurementApi, productsApi, stockApi, unitsApi, vendorsApi } from '../services/api';
import {
  fromBaseQuantity,
  fromBaseUnitPrice,
  getEntryUnitOptions,
  getSubUnit,
  toBaseQuantity,
  toBaseUnitPrice,
} from '../services/unitConversion';
import { colors, radius } from '../theme';

const emptyItem = () => ({ id: Date.now() + Math.random(), productId: null, unit: '', entryUnit: '', quantity: '', price: '' });
const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'];
const emptyPaymentDetails = () => ({
  mode: 'Cash',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  transactionId: '',
});

export default function StockInScreen({ embedded = false } = {}) {
  const { activeBranchId } = useAuth();
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [units, setUnits] = useState([]);
  const [allMovements, setAllMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vendorId, setVendorId] = useState(null);
  const [vendorError, setVendorError] = useState(false);
  const [billNo, setBillNo] = useState('');
  // null = not asked yet, true = paid, false/unset = unpaid (matches web)
  const [billPaid, setBillPaid] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(emptyPaymentDetails());
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [note, setNote] = useState('');
  const [items, setItems] = useState([emptyItem()]);
  const [requestNumberInput, setRequestNumberInput] = useState('');
  const [loadedRequestNumber, setLoadedRequestNumber] = useState(null);
  const [loadingRequest, setLoadingRequest] = useState(false);

  const load = useCallback(async () => {
    try {
      const [productList, vendorList, unitList, movementList] = await Promise.all([
        productsApi.list({ is_active: true }),
        vendorsApi.list({ is_active: true }),
        unitsApi.list({ is_active: true }),
        stockApi.movements(),
      ]);
      setProducts(productList);
      setVendors(vendorList);
      setUnits(unitList);
      setAllMovements(
        movementList.filter(
          (m) =>
            m.warehouse_id === activeBranchId &&
            (m.movement_type === 'in' || (m.movement_type === 'adjustment' && m.quantity > 0)),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  // Main FlatList data - sorting/slicing this on every render (e.g. every
  // keystroke in the form above) was the main source of lag on a warehouse
  // with a long movement history.
  const recentMovements = useMemo(
    () =>
      [...allMovements]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 15),
    [allMovements],
  );

  const todaysIn = useMemo(() => {
    const today = new Date().toDateString();
    return allMovements.filter((m) => new Date(m.created_at).toDateString() === today);
  }, [allMovements]);
  const todayItemsReceived = useMemo(() => todaysIn.reduce((sum, m) => sum + m.quantity, 0), [todaysIn]);
  const todayPurchaseValue = useMemo(
    () =>
      todaysIn.reduce((sum, m) => sum + m.quantity * Number(productMap[m.product_id]?.purchase_price || 0), 0),
    [todaysIn, productMap],
  );

  const itemBaseQty = useCallback(
    (item) => {
      const product = productMap[item.productId];
      if (!product) return 0;
      return toBaseQuantity(item.quantity || 0, item.entryUnit || item.unit, product.unit_of_measure, units);
    },
    [productMap, units],
  );

  const totalQuantity = useMemo(() => items.reduce((sum, item) => sum + itemBaseQty(item), 0), [items, itemBaseQty]);
  const totalValue = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0),
    [items],
  );
  const hasValidItems = useMemo(() => items.some((item) => item.productId), [items]);

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const data = [...prev];
      const item = { ...data[index], [field]: value };
      if (field === 'productId') {
        const product = productMap[value];
        if (product) {
          item.unit = product.unit_of_measure;
          item.entryUnit = product.unit_of_measure;
          item.price = String(product.purchase_price || '');
          item.quantity = '1';
          if (!vendorId && product.vendor_id) setVendorId(product.vendor_id);
        }
      }
      data[index] = item;
      return data;
    });
  };

  const handleEntryUnitChange = (index, value) => {
    setItems((prev) => {
      const data = [...prev];
      const item = data[index];
      const baseUnitPrice = toBaseUnitPrice(item.price, item.entryUnit || item.unit, item.unit, units);
      data[index] = { ...item, entryUnit: value, price: String(fromBaseUnitPrice(baseUnitPrice, value, item.unit, units)) };
      return data;
    });
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (index) => setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

  const handleLoadRequestNumber = async () => {
    const requestNumber = requestNumberInput.trim();
    if (!requestNumber) {
      Alert.alert('Missing number', 'Enter a procurement request number.');
      return;
    }
    setLoadingRequest(true);
    try {
      const requests = await procurementApi.getByNumber(requestNumber);
      const loadedItems = requests.map((r) => {
        const product = productMap[r.product_id];
        const unit = product?.unit_of_measure || '';
        const subUnit = getSubUnit(unit, units);
        const baseQty = Number(r.quantity) || 0;
        const useSubUnit = subUnit && baseQty > 0 && baseQty < 1;
        return {
          id: Date.now() + Math.random(),
          productId: r.product_id,
          unit,
          entryUnit: useSubUnit ? subUnit : unit,
          quantity: String(useSubUnit ? fromBaseQuantity(baseQty, subUnit, unit, units) : baseQty),
          price: String(Number(product?.purchase_price || 0)),
        };
      });
      const firstVendorId = requests.find((r) => r.vendor_id)?.vendor_id;
      if (firstVendorId) setVendorId(firstVendorId);
      setItems(loadedItems.length ? loadedItems : [emptyItem()]);
      setLoadedRequestNumber(requestNumber);
      Alert.alert('Loaded', `Loaded ${loadedItems.length} item(s) from ${requestNumber}.`);
    } catch (err) {
      Alert.alert('Not found', err.message || 'Procurement request not found.');
    } finally {
      setLoadingRequest(false);
    }
  };

  const handleTogglePaid = (checked) => {
    if (!checked) {
      setBillPaid(null);
      return;
    }
    if (!billNo.trim()) {
      Alert.alert('Missing bill number', 'Enter a bill number first.');
      return;
    }
    if (!vendorId) {
      Alert.alert('No vendor', 'Saved as a local purchase - no bill will be tracked in Payments without a vendor.');
      return;
    }
    setPaymentDetails({ ...emptyPaymentDetails(), amount: totalValue > 0 ? totalValue.toFixed(2) : '' });
    setShowPaymentDetails(true);
  };

  const handleConfirmPaymentDetails = () => {
    if (!paymentDetails.amount || Number(paymentDetails.amount) <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount paid.');
      return;
    }
    setBillPaid(true);
    setShowPaymentDetails(false);
  };

  const validateForm = () => {
    const validItems = items.filter((item) => item.productId);
    if (validItems.length === 0) {
      Alert.alert('Missing items', 'Please add at least one item.');
      return false;
    }
    const invalidItem = validItems.some((item) => Number(item.quantity) <= 0 || Number(item.price) <= 0);
    if (invalidItem) {
      Alert.alert('Invalid item', 'Please enter a valid quantity and price for every item.');
      return false;
    }
    if (!vendorId) {
      setVendorError(true);
      Alert.alert('Missing vendor', 'Please select a vendor.');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    const validItems = items.filter((item) => item.productId);

    Alert.alert(
      'Save this Stock In entry?',
      `${validItems.length} item${validItems.length > 1 ? 's' : ''}, Total Rs ${totalValue.toFixed(2)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => performSave(validItems) },
      ],
    );
  };

  const performSave = async (validItems) => {
    setSaving(true);
    try {
      await Promise.all(
        validItems.map((item) => {
          const product = productMap[item.productId];
          const baseQty = toBaseQuantity(item.quantity, item.entryUnit, product.unit_of_measure, units);
          return stockApi.adjust({
            product_id: item.productId,
            warehouse_id: activeBranchId,
            vendor_id: vendorId,
            quantity: baseQty,
            movement_type: 'in',
            reference: billNo || null,
            note: note || 'Stock In',
          });
        }),
      );

      if (vendorId) {
        const billAmount = validItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
        await paymentsApi.createBill({
          vendor_id: vendorId,
          bill_number: billNo.trim() || null,
          bill_amount: billAmount,
          bill_date: new Date().toISOString().slice(0, 10),
          is_paid: billPaid === true,
          items: validItems.map((item) => {
            const product = productMap[item.productId];
            return {
              product_id: item.productId,
              quantity: toBaseQuantity(item.quantity, item.entryUnit, product.unit_of_measure, units),
              unit_price: toBaseUnitPrice(item.price, item.entryUnit, product.unit_of_measure, units),
            };
          }),
        });

        if (billPaid) {
          await paymentsApi.createPayment({
            vendor_id: vendorId,
            payment_date: paymentDetails.date,
            payment_mode: paymentDetails.mode,
            amount_paid: Number(paymentDetails.amount) || billAmount,
            adjustment_amount: 0,
            transaction_id: paymentDetails.transactionId || null,
            note: billNo.trim() ? `Paid at Stock In entry for bill ${billNo.trim()}` : 'Paid at Stock In entry',
          });
        }
      }

      // Keep each product's cost price current to the latest buying price.
      await Promise.all(
        validItems
          .map((item) => {
            const product = productMap[item.productId];
            const baseUnitPrice = toBaseUnitPrice(item.price, item.entryUnit, product.unit_of_measure, units);
            return { item, product, baseUnitPrice };
          })
          .filter(({ product, baseUnitPrice }) => Number(baseUnitPrice.toFixed(4)) !== Number(product.purchase_price || 0))
          .map(({ item, baseUnitPrice }) => productsApi.update(item.productId, { purchase_price: baseUnitPrice })),
      );

      if (loadedRequestNumber) {
        try {
          await procurementApi.fulfillByNumber(loadedRequestNumber);
        } catch (err) {
          Alert.alert('Partially saved', `Stock In saved, but failed to mark ${loadedRequestNumber} as fulfilled: ${err.message || 'unknown error'}`);
        }
      }

      handleReset();
      await load();
      Alert.alert('Saved', `${validItems.length} item${validItems.length > 1 ? 's' : ''} added to stock - Total Rs ${totalValue.toFixed(2)}.`);
    } catch (err) {
      Alert.alert('Failed', err.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setItems([emptyItem()]);
    setVendorId(null);
    setVendorError(false);
    setBillNo('');
    setBillPaid(null);
    setPaymentDetails(emptyPaymentDetails());
    setNote('');
    setRequestNumberInput('');
    setLoadedRequestNumber(null);
  };

  return (
    <View style={styles.container}>
      {!embedded && <ScreenHeader title="Stock In" />}
      <FlatList
        data={recentMovements}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.flatContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <>
            <View style={styles.summaryRow}>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Today's Stock In</Text>
                <Text style={styles.summaryValue}>{Math.round(todayItemsReceived).toLocaleString()}</Text>
                <Text style={styles.summarySubtitle}>Items Received</Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Purchase Cost</Text>
                <Text style={styles.summaryValue}>Rs {todayPurchaseValue.toLocaleString()}</Text>
                <Text style={styles.summarySubtitle}>Today's Purchases</Text>
              </Card>
            </View>

            <Card style={styles.form}>
              <Text style={styles.formTitle}>Procurement List No. (optional)</Text>
              <View style={styles.rowInputs}>
                <Input
                  placeholder="e.g. PR-0001"
                  value={requestNumberInput}
                  onChangeText={setRequestNumberInput}
                  style={{ flex: 1 }}
                />
                <Button title="Load" variant="outline" onPress={handleLoadRequestNumber} loading={loadingRequest} />
              </View>
              {loadedRequestNumber && (
                <Text style={styles.paidSummary}>Loaded from {loadedRequestNumber}. Review and save below.</Text>
              )}
            </Card>

            <Card style={styles.form}>
              <Text style={styles.formTitle}>Vendor & Bill</Text>
              <Text style={styles.label}>
                Vendor<Text style={styles.requiredMark}> *</Text>
              </Text>
              <SelectPicker
                items={vendors.map((v) => ({ id: v.id, label: v.name }))}
                value={vendorId}
                onChange={(id) => {
                  setVendorId(id);
                  setVendorError(false);
                  setBillPaid(null);
                }}
                placeholder="Select Vendor"
                title="Select Vendor"
              />
              {vendorError ? (
                <Text style={styles.errorText}>Vendor is required.</Text>
              ) : (
                <Text style={styles.helperText}>Applies to every item in this entry.</Text>
              )}
              <Text style={styles.label}>Bill No. (optional)</Text>
              <Input
                placeholder="Vendor's bill/invoice number"
                value={billNo}
                onChangeText={(v) => {
                  setBillNo(v);
                  setBillPaid(null);
                }}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Bill is Paid</Text>
                <Switch value={billPaid === true} onValueChange={handleTogglePaid} />
              </View>
              <Text style={billPaid === null ? styles.helperText : styles.paidSummary}>
                {billPaid === null
                  ? 'If set, a bill is added to Payments for the vendor above - left unchecked, it shows as outstanding.'
                  : `Marked Paid - Rs ${paymentDetails.amount} via ${paymentDetails.mode} on ${paymentDetails.date}`}
              </Text>
            </Card>

            <View style={styles.itemsHeaderRow}>
              <Text style={styles.formTitle}>Items Received</Text>
              <Button title="+ Add Item" variant="outline" onPress={addItem} />
            </View>
            <Text style={styles.infoText}>
              Buying in packs (e.g. a Box of 12)? Pick the pack in Measure and enter how many - it's added to
              stock as the correct number of individual units automatically. Set up pack sizes under Settings
              &gt; Units.
            </Text>

            {items.map((item, index) => {
              const product = productMap[item.productId];
              const entryUnitOptions = product ? getEntryUnitOptions(product.unit_of_measure, units) : [];
              const baseQty = itemBaseQty(item);
              const subtotal = Number(item.quantity || 0) * Number(item.price || 0);
              return (
                <Card key={item.id} style={styles.itemCard}>
                  <View style={styles.itemHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <ProductPicker
                        products={products}
                        value={item.productId}
                        onChange={(id) => handleItemChange(index, 'productId', id)}
                        placeholder="Select Item"
                      />
                    </View>
                    <Pressable
                      onPress={() => removeItem(index)}
                      disabled={items.length === 1}
                      style={[styles.deleteButton, items.length === 1 && styles.deleteButtonDisabled]}
                    >
                      <Ionicons name="trash-outline" size={18} color={items.length === 1 ? colors.textFaint : colors.danger} />
                    </Pressable>
                  </View>

                  {product && (
                    <>
                      {entryUnitOptions.length > 1 ? (
                        <View style={styles.unitRow}>
                          {entryUnitOptions.map((u) => (
                            <Pressable
                              key={u}
                              onPress={() => handleEntryUnitChange(index, u)}
                              style={[styles.unitChip, (item.entryUnit || item.unit) === u && styles.unitChipActive]}
                            >
                              <Text style={[styles.unitChipText, (item.entryUnit || item.unit) === u && styles.unitChipTextActive]}>
                                {u}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.helperText}>Measure: {product.unit_of_measure}</Text>
                      )}

                      <View style={styles.rowInputs}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Qty</Text>
                          <Input
                            placeholder="0"
                            keyboardType="numeric"
                            value={String(item.quantity)}
                            onChangeText={(v) => handleItemChange(index, 'quantity', v)}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Price / {item.entryUnit || item.unit}</Text>
                          <Input
                            placeholder="0"
                            keyboardType="numeric"
                            value={String(item.price)}
                            onChangeText={(v) => handleItemChange(index, 'price', v)}
                          />
                        </View>
                      </View>

                      <View style={styles.subtotalRow}>
                        <Text style={styles.subtotalLabel}>Sub-total</Text>
                        <Text style={styles.subtotalValue}>Rs {subtotal.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.subtotalMeta}>
                        {item.quantity || 0} {item.entryUnit || item.unit}
                        {(item.entryUnit || item.unit) !== product.unit_of_measure ? ` (${baseQty} ${product.unit_of_measure})` : ''} x
                        {' '}Rs {item.price || 0}/{item.entryUnit || item.unit}
                      </Text>
                    </>
                  )}
                </Card>
              );
            })}

            <Card style={styles.form}>
              <View style={styles.cartTotalRow}>
                <Text style={styles.cartTotalLabel}>Total</Text>
                <Text style={styles.cartTotalValue}>Rs {totalValue.toFixed(2)}</Text>
              </View>

              <Text style={styles.label}>Note (optional)</Text>
              <Input placeholder="e.g. Bought from Sharma Kirana" value={note} onChangeText={setNote} />

              <View style={styles.cartTotalRow}>
                <Text style={styles.cartTotalLabel}>Total Quantity</Text>
                <Text style={styles.cartTotalValue}>{Math.round(totalQuantity * 100) / 100}</Text>
              </View>
              <View style={styles.cartTotalRow}>
                <Text style={styles.cartTotalLabel}>Total Cost</Text>
                <Text style={styles.cartTotalValue}>Rs {totalValue.toFixed(2)}</Text>
              </View>

              <View style={styles.formActions}>
                <Button title="Reset" variant="outline" onPress={handleReset} style={{ flex: 1 }} />
                <Button title="Save Stock In" onPress={handleSave} loading={saving} disabled={!hasValidItems} style={{ flex: 1 }} />
              </View>
            </Card>

            <SectionTitle>Recent Stock In</SectionTitle>
          </>
        }
        renderItem={({ item }) => {
          const product = productMap[item.product_id];
          return (
            <View style={styles.movementRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.movementName}>{product?.name || `Product #${item.product_id}`}</Text>
                <Text style={styles.movementMeta}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <Pill label={`${item.quantity} ${product?.unit_of_measure || ''}`} tone="success" />
            </View>
          );
        }}
        ListEmptyComponent={!loading && <EmptyState text="No Stock In entries yet." />}
      />

      <Modal visible={showPaymentDetails} animationType="slide" transparent onRequestClose={() => setShowPaymentDetails(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.formTitle}>Payment Details</Text>
            <Text style={styles.label}>Mode of Payment</Text>
            <View style={styles.unitRow}>
              {PAYMENT_MODES.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setPaymentDetails((p) => ({ ...p, mode: m }))}
                  style={[styles.unitChip, paymentDetails.mode === m && styles.unitChipActive]}
                >
                  <Text style={[styles.unitChipText, paymentDetails.mode === m && styles.unitChipTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Amount Paid</Text>
            <Input
              placeholder="Amount paid"
              keyboardType="numeric"
              value={paymentDetails.amount}
              onChangeText={(v) => setPaymentDetails((p) => ({ ...p, amount: v }))}
            />
            <Text style={styles.label}>Date</Text>
            <DatePicker value={paymentDetails.date} onChange={(v) => setPaymentDetails((p) => ({ ...p, date: v }))} mode="date" />
            <Text style={styles.label}>Transaction ID / Cheque No. (optional)</Text>
            <Input
              placeholder="UPI ref, cheque no., etc."
              value={paymentDetails.transactionId}
              onChangeText={(v) => setPaymentDetails((p) => ({ ...p, transactionId: v }))}
            />
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => {
                  setShowPaymentDetails(false);
                  setBillPaid(null);
                }}
                style={{ flex: 1 }}
              />
              <Button title="Save" onPress={handleConfirmPaymentDetails} style={{ flex: 1 }} />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 12, paddingBottom: 40, gap: 10 },
  flatContent: { padding: 16, paddingTop: 12, paddingBottom: 40 },
  separator: { height: 1, backgroundColor: colors.border },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryCard: { flex: 1, gap: 2 },
  summaryLabel: { fontSize: 12, color: colors.textMuted },
  summaryValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  summarySubtitle: { fontSize: 12, color: colors.success, fontWeight: '600' },
  form: { gap: 10, marginBottom: 12 },
  formTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  itemsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoText: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { fontSize: 14, color: colors.pillText, fontWeight: '500' },
  paidSummary: { fontSize: 12, color: colors.success, fontWeight: '600' },
  helperText: { fontSize: 12, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600', color: colors.pillText },
  requiredMark: { color: colors.danger },
  errorText: { fontSize: 12, color: colors.danger, marginTop: -4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: radius.xl, gap: 10 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.pill },
  unitChipActive: { backgroundColor: colors.ink },
  unitChipText: { fontSize: 12, fontWeight: '600', color: colors.pillText },
  unitChipTextActive: { color: '#fff' },
  rowInputs: { flexDirection: 'row', gap: 10 },
  itemCard: { gap: 8, marginBottom: 10 },
  itemHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonDisabled: { opacity: 0.5 },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  subtotalLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  subtotalValue: { fontSize: 15, fontWeight: '700', color: colors.success },
  subtotalMeta: { fontSize: 11, color: colors.textFaint },
  cartTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6 },
  cartTotalLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  cartTotalValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  movementRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: colors.card },
  movementName: { fontSize: 14, fontWeight: '600', color: colors.text },
  movementMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
