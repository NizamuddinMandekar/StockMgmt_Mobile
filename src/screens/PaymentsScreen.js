import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import DatePicker from '../components/DatePicker';
import ScreenHeader from '../components/ScreenHeader';
import SearchBar from '../components/SearchBar';
import SelectPicker from '../components/SelectPicker';
import { Button, Card, EmptyState, Input, Pill, SectionTitle } from '../components/ui';
import { paymentsApi, productsApi, stockApi, vendorsApi } from '../services/api';
import { colors, radius } from '../theme';
import { exportCsv, exportPdf, rowsToCsv } from '../utils/exportFile';

function ExportButton({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.exportBtn}>
      <Ionicons name={icon} size={15} color={colors.pillText} />
      <Text style={styles.exportBtnText}>{label}</Text>
    </Pressable>
  );
}

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'];

const emptyBillItem = () => ({ id: Date.now() + Math.random(), productId: null, quantity: '1', unitPrice: '0' });

const emptyBillForm = () => ({
  billNumber: '',
  billDate: new Date().toISOString().slice(0, 10),
  billAmount: '',
  note: '',
  items: [],
});

const emptyPaymentForm = () => ({
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMode: 'Cash',
  amountPaid: '',
  balanceAdjustment: '',
  transactionId: '',
  note: '',
});

function FieldLabel({ children }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export default function PaymentsScreen() {
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState([]);
  const [localPurchases, setLocalPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [activeVendorId, setActiveVendorId] = useState(null);
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewingBill, setViewingBill] = useState(null);

  const [showBillForm, setShowBillForm] = useState(false);
  const [billForm, setBillForm] = useState(emptyBillForm());
  const [savingBill, setSavingBill] = useState(false);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [savingPayment, setSavingPayment] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vendorList, productList, summaryList, movements] = await Promise.all([
        vendorsApi.list({ is_active: true }),
        productsApi.list({ is_active: true }),
        paymentsApi.summary(),
        stockApi.movements(),
      ]);
      setVendors(vendorList);
      setProducts(productList);
      setSummary(summaryList);
      setLocalPurchases(
        movements.filter(
          (m) => !m.vendor_id && (m.movement_type === 'in' || (m.movement_type === 'adjustment' && m.quantity > 0)),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const vendorsById = Object.fromEntries(vendors.map((v) => [v.id, v]));
  const productsById = Object.fromEntries(products.map((p) => [p.id, p]));

  const filteredSummary = summary.filter(
    (row) => !search || row.vendor_name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalOutstanding = summary.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
  const totalLocalValue = localPurchases.reduce(
    (sum, m) => sum + m.quantity * Number(productsById[m.product_id]?.purchase_price || 0),
    0,
  );

  const activeVendor = vendorsById[activeVendorId];

  const openVendor = async (vendorId) => {
    setActiveVendorId(vendorId);
    setDetailLoading(true);
    try {
      const [billList, paymentList] = await Promise.all([
        paymentsApi.listBills(vendorId),
        paymentsApi.listPayments(vendorId),
      ]);
      setBills(billList);
      setPayments(paymentList);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeVendor = () => {
    setActiveVendorId(null);
    setBills([]);
    setPayments([]);
  };

  const refreshVendorDetail = () => {
    if (activeVendorId) openVendor(activeVendorId);
  };

  const vendorTotalBilled = bills.reduce((sum, b) => sum + Number(b.bill_amount || 0), 0);
  const vendorTotalPaid = payments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
  const vendorTotalAdjusted = payments.reduce((sum, p) => sum + Number(p.adjustment_amount || 0), 0);
  const vendorOutstanding = vendorTotalBilled - vendorTotalPaid - vendorTotalAdjusted;

  const billPaidStatus = useMemo(() => {
    const totalApplied = payments.reduce((sum, p) => sum + Number(p.amount_paid || 0) + Number(p.adjustment_amount || 0), 0);
    const sortedBills = [...bills].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let remaining = totalApplied;
    const statusById = {};
    for (const bill of sortedBills) {
      const billAmount = Number(bill.bill_amount || 0);
      const coveredByFifo = remaining >= billAmount - 0.01;
      statusById[bill.id] = coveredByFifo;
      if (coveredByFifo) remaining -= billAmount;
    }
    return statusById;
  }, [bills, payments]);
  const isBillPaid = (bill) => billPaidStatus[bill.id] ?? false;

  const paymentLedger = useMemo(() => {
    const events = [
      ...bills.map((b) => ({ type: 'bill', at: b.created_at, amount: Number(b.bill_amount || 0) })),
      ...payments.map((p) => ({
        type: 'payment',
        at: p.created_at,
        amount: -(Number(p.amount_paid || 0) + Number(p.adjustment_amount || 0)),
        payment: p,
      })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));

    let running = 0;
    const ledger = [];
    for (const event of events) {
      running += event.amount;
      if (event.type === 'payment') {
        const rounded = Math.round(running * 100) / 100;
        ledger.push({
          ...event.payment,
          amount_paid: Number(event.payment.amount_paid || 0),
          adjustment_amount: Number(event.payment.adjustment_amount || 0),
          balanceAfter: rounded === 0 ? 0 : rounded,
        });
      }
    }
    return ledger.reverse();
  }, [bills, payments]);

  // ---- Export Bill (CSV / PDF) - mirrors web's exportBillCsv/exportBillPdf ----
  const handleExportBillCsv = async () => {
    const bill = viewingBill;
    const vendorName = activeVendor?.name || '-';
    try {
      const rows = [
        [`Bill ${bill.bill_number || `#${bill.id}`}`],
        [`Vendor: ${vendorName}`],
        [`Bill Date: ${bill.bill_date}`],
        [],
        ['Item', 'Quantity', 'Unit Price', 'Sub Total'],
        ...bill.items.map((item) => [
          productsById[item.product_id]?.name || '-',
          item.quantity,
          Number(item.unit_price || 0),
          Number(item.sub_total || 0),
        ]),
        [],
        ['', '', 'Bill Total', Number(bill.bill_amount || 0)],
      ];
      await exportCsv(`bill-${bill.bill_number || bill.id}.csv`, rowsToCsv(rows));
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not export CSV.');
    }
  };

  const handleExportBillPdf = async () => {
    const bill = viewingBill;
    const vendorName = activeVendor?.name || '-';
    try {
      const itemsHtml = (bill.items || [])
        .map(
          (item) => `<tr>
            <td>${productsById[item.product_id]?.name || '-'}</td>
            <td>${item.quantity}</td>
            <td>Rs. ${Number(item.unit_price).toLocaleString()}</td>
            <td>Rs. ${Number(item.sub_total).toLocaleString()}</td>
          </tr>`,
        )
        .join('');
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Helvetica, Arial, sans-serif; padding: 24px; color: #111318; }
              h1 { font-size: 20px; margin-bottom: 4px; }
              p { font-size: 12px; margin: 2px 0; color: #333; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; }
              th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
              th { background: #f4f4f5; }
              tfoot td { font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>Bill ${bill.bill_number || `#${bill.id}`}</h1>
            <p>Vendor: ${vendorName}</p>
            <p>Bill Date: ${bill.bill_date}</p>
            <table>
              <thead><tr><th>Item</th><th>Quantity</th><th>Unit Price</th><th>Sub Total</th></tr></thead>
              <tbody>${itemsHtml}</tbody>
              <tfoot><tr><td></td><td></td><td>Bill Total</td><td>Rs. ${Number(bill.bill_amount).toLocaleString()}</td></tr></tfoot>
            </table>
          </body>
        </html>
      `;
      await exportPdf(`bill-${bill.bill_number || bill.id}.pdf`, html);
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not export PDF.');
    }
  };

  // ---- Add Bill ----
  const openBillForm = () => {
    setBillForm(emptyBillForm());
    setShowBillForm(true);
  };

  const handleBillItemChange = (index, field, value) => {
    const list = [...billForm.items];
    list[index] = { ...list[index], [field]: value };
    setBillForm({ ...billForm, items: list });
  };

  const addBillItemRow = () => setBillForm({ ...billForm, items: [...billForm.items, emptyBillItem()] });
  const removeBillItemRow = (index) => {
    const list = [...billForm.items];
    list.splice(index, 1);
    setBillForm({ ...billForm, items: list });
  };

  const itemsSubTotal = billForm.items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );

  const handleSaveBill = async () => {
    const validItems = billForm.items.filter((i) => i.productId);
    const amount = validItems.length > 0 ? itemsSubTotal : Number(billForm.billAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Missing amount', 'Enter a bill amount, or add at least one item.');
      return;
    }
    setSavingBill(true);
    try {
      await paymentsApi.createBill({
        vendor_id: activeVendorId,
        bill_number: billForm.billNumber || null,
        bill_amount: amount,
        bill_date: billForm.billDate,
        note: billForm.note || null,
        items: validItems.map((i) => ({
          product_id: Number(i.productId),
          quantity: Number(i.quantity),
          unit_price: Number(i.unitPrice),
        })),
      });
      setShowBillForm(false);
      refreshVendorDetail();
      paymentsApi.summary().then(setSummary);
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not add bill.');
    } finally {
      setSavingBill(false);
    }
  };

  // ---- Add / Edit Payment ----
  const openPaymentForm = () => {
    setEditingPaymentId(null);
    setPaymentForm(emptyPaymentForm());
    setShowPaymentForm(true);
  };

  const openPaymentForBill = (bill) => {
    setEditingPaymentId(null);
    setPaymentForm({
      ...emptyPaymentForm(),
      amountPaid: String(Math.min(Number(bill.bill_amount), vendorOutstanding).toFixed(2)),
      note: `Payment for bill ${bill.bill_number || `#${bill.id}`}`,
    });
    setViewingBill(null);
    setShowPaymentForm(true);
  };

  const openEditPayment = (payment) => {
    const amountPaid = Number(payment.amount_paid || 0);
    const adjustmentAmount = Number(payment.adjustment_amount || 0);
    setEditingPaymentId(payment.id);
    setPaymentForm({
      paymentDate: payment.payment_date,
      paymentMode: payment.payment_mode || 'Cash',
      amountPaid: amountPaid > 0 ? String(amountPaid) : '',
      balanceAdjustment: adjustmentAmount > 0 ? String(adjustmentAmount) : '',
      transactionId: payment.transaction_id || '',
      note: payment.note || '',
    });
    setShowPaymentForm(true);
  };

  const editingPayment = editingPaymentId ? payments.find((p) => p.id === editingPaymentId) : null;
  const paymentAvailableRoom =
    vendorOutstanding +
    (editingPayment ? Number(editingPayment.amount_paid || 0) + Number(editingPayment.adjustment_amount || 0) : 0);
  const paymentFormTotal = (Number(paymentForm.amountPaid) || 0) + (Number(paymentForm.balanceAdjustment) || 0);
  const paymentExceedsOutstanding = paymentFormTotal > paymentAvailableRoom + 0.01;

  const closePaymentForm = () => {
    setShowPaymentForm(false);
    setEditingPaymentId(null);
  };

  const handleSavePayment = async () => {
    const amountPaid = Number(paymentForm.amountPaid) || 0;
    const adjustment = Number(paymentForm.balanceAdjustment) || 0;
    if (amountPaid <= 0 && adjustment <= 0) {
      Alert.alert('Missing amount', 'Enter an amount paid, a balance adjustment, or both.');
      return;
    }
    if (paymentExceedsOutstanding) {
      Alert.alert('Amount too high', `Amount can't exceed the outstanding balance (Rs ${paymentAvailableRoom.toFixed(2)}).`);
      return;
    }
    setSavingPayment(true);
    try {
      const payload = {
        payment_date: paymentForm.paymentDate,
        payment_mode: amountPaid > 0 ? paymentForm.paymentMode : null,
        amount_paid: amountPaid,
        adjustment_amount: adjustment,
        transaction_id: paymentForm.transactionId || null,
        note: paymentForm.note || null,
      };
      if (editingPaymentId) {
        await paymentsApi.updatePayment(editingPaymentId, payload);
      } else {
        await paymentsApi.createPayment({ vendor_id: activeVendorId, ...payload });
      }
      closePaymentForm();
      refreshVendorDetail();
      paymentsApi.summary().then(setSummary);
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not save payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Payments" />
      <FlatList
        data={filteredSummary}
        keyExtractor={(item) => String(item.vendor_id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.summaryRow}>
              <Card style={[styles.totalCard, { flex: 1 }]}>
                <Text style={styles.totalLabel}>Total Amount Balance</Text>
                <Text style={[styles.totalValue, totalOutstanding > 0 && styles.negativeValue]}>
                  Rs {totalOutstanding.toFixed(0)}
                </Text>
                <Text style={styles.helperText}>Outstanding across every vendor</Text>
              </Card>
              <Card style={[styles.totalCard, { flex: 1 }]}>
                <Text style={styles.totalLabel}>Local Purchases</Text>
                <Text style={styles.totalValue}>Rs {totalLocalValue.toFixed(0)}</Text>
                <Text style={styles.helperText}>
                  {localPurchases.length} entr{localPurchases.length === 1 ? 'y' : 'ies'} - no vendor, no balance owed
                </Text>
              </Card>
            </View>

            <SearchBar placeholder="Search vendor..." value={search} onChangeText={setSearch} style={{ marginBottom: 10 }} />
            <SectionTitle>List of Vendors</SectionTitle>
          </>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 30).duration(250)}>
            <Pressable onPress={() => openVendor(item.vendor_id)}>
              <Card style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.vendor_name}</Text>
                  <Text style={styles.meta}>
                    {item.total_bills} bill{item.total_bills === 1 ? '' : 's'} · Billed Rs {Number(item.total_bill_amount || 0).toFixed(0)}{' '}
                    · Paid Rs {Number(item.total_amount_paid || 0).toFixed(0)}
                    {Number(item.amount_adjusted || 0) > 0 ? ` · Adjusted Rs ${Number(item.amount_adjusted || 0).toFixed(0)}` : ''}
                  </Text>
                </View>
                <Pill
                  label={`Rs ${Number(item.balance_amount || 0).toFixed(0)}`}
                  tone={Number(item.balance_amount || 0) > 0 ? 'danger' : 'success'}
                />
              </Card>
            </Pressable>
          </Animated.View>
        )}
        ListEmptyComponent={!loading && <EmptyState text="No vendor bills recorded yet" />}
        ListFooterComponent={
          <>
            <SectionTitle>Local Purchases</SectionTitle>
            {loading ? (
              <EmptyState text="Loading..." />
            ) : localPurchases.length === 0 ? (
              <EmptyState text="No local purchases recorded" />
            ) : (
              localPurchases.map((m) => (
                <Card key={m.id} style={styles.detailRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{productsById[m.product_id]?.name || '-'}</Text>
                    <Text style={styles.meta}>
                      {m.reference || 'No reference'} · Qty {m.quantity} · {new Date(m.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.paymentAmount}>
                    Rs {(m.quantity * Number(productsById[m.product_id]?.purchase_price || 0)).toFixed(0)}
                  </Text>
                </Card>
              ))
            )}
          </>
        }
      />

      {/* VENDOR DETAIL MODAL */}
      <Modal visible={!!activeVendorId} animationType="slide" onRequestClose={closeVendor}>
        <View style={styles.modal}>
          <ScreenHeader title={activeVendor?.name || 'Vendor'} />
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Card style={styles.balanceCard}>
              <Text style={styles.totalLabel}>Total Outstanding</Text>
              <Text style={[styles.totalValue, vendorOutstanding > 0 && styles.negativeValue]}>
                Rs {vendorOutstanding.toFixed(2)}
              </Text>
              <View style={styles.actionsRow}>
                <Button title="+ Add Bill" variant="outline" onPress={openBillForm} style={{ flex: 1 }} />
                <Button
                  title="+ Add Payment"
                  onPress={openPaymentForm}
                  disabled={vendorOutstanding <= 0}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>

            <SectionTitle>Bills</SectionTitle>
            {detailLoading ? (
              <EmptyState text="Loading..." />
            ) : bills.length === 0 ? (
              <EmptyState text="No bills yet" />
            ) : (
              bills.map((bill) => (
                <Pressable key={bill.id} onPress={() => setViewingBill(bill)}>
                  <Card style={styles.detailRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{bill.bill_number || `Bill #${bill.id}`}</Text>
                      <Text style={styles.meta}>{bill.bill_date}</Text>
                    </View>
                    <Pill label={isBillPaid(bill) ? 'Paid' : 'Unpaid'} tone={isBillPaid(bill) ? 'success' : 'danger'} />
                    <Text style={[styles.paymentAmount, { marginLeft: 8 }]}>Rs {Number(bill.bill_amount || 0).toFixed(0)}</Text>
                  </Card>
                </Pressable>
              ))
            )}

            <SectionTitle>Payment History</SectionTitle>
            {payments.length === 0 ? (
              <EmptyState text="No payments yet" />
            ) : (
              paymentLedger.map((p) => (
                <Pressable key={p.id} onPress={() => openEditPayment(p)}>
                  <Card style={styles.detailRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{p.payment_mode || 'Adjustment'}</Text>
                      <Text style={styles.meta}>
                        {p.payment_date}
                        {p.transaction_id ? ` · ${p.transaction_id}` : ''}
                        {p.note ? ` · ${p.note}` : ''}
                      </Text>
                      <Text style={styles.meta}>Balance after: Rs {Number(p.balanceAfter || 0).toFixed(0)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {Number(p.amount_paid || 0) > 0 && (
                        <Text style={styles.paymentAmount}>Rs {Number(p.amount_paid || 0).toFixed(0)}</Text>
                      )}
                      {Number(p.adjustment_amount || 0) > 0 && (
                        <Text style={styles.meta}>Adj Rs {Number(p.adjustment_amount || 0).toFixed(0)}</Text>
                      )}
                    </View>
                  </Card>
                </Pressable>
              ))
            )}
          </ScrollView>
          <Button title="Close" variant="outline" onPress={closeVendor} style={styles.closeBtn} />
        </View>
      </Modal>

      {/* BILL ITEMS MODAL */}
      <Modal visible={!!viewingBill} animationType="fade" transparent onRequestClose={() => setViewingBill(null)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.formTitle}>
              Bill {viewingBill?.bill_number || `#${viewingBill?.id}`} - Items
            </Text>
            {!!viewingBill?.note && <Text style={styles.helperText}>{viewingBill.note}</Text>}
            <ScrollView style={{ maxHeight: 260 }}>
              {(viewingBill?.items || []).length === 0 ? (
                <Text style={styles.helperText}>No item breakdown for this bill - just a lump amount.</Text>
              ) : (
                viewingBill.items.map((item) => (
                  <View key={item.id} style={styles.itemLine}>
                    <Text style={styles.meta}>{productsById[item.product_id]?.name || '-'}</Text>
                    <Text style={styles.meta}>
                      {item.quantity} x Rs {Number(item.unit_price || 0).toFixed(0)} = Rs {Number(item.sub_total || 0).toFixed(0)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.itemLine}>
              <Text style={[styles.name]}>Bill Total</Text>
              <Text style={styles.paymentAmount}>Rs {Number(viewingBill?.bill_amount || 0).toFixed(0)}</Text>
            </View>
            <View style={styles.exportRow}>
              <ExportButton icon="document-text-outline" label="CSV" onPress={handleExportBillCsv} />
              <ExportButton icon="document-outline" label="PDF" onPress={handleExportBillPdf} />
            </View>
            {viewingBill && !isBillPaid(viewingBill) && (
              <Button
                title="Make Payment"
                onPress={() => openPaymentForBill(viewingBill)}
                disabled={vendorOutstanding <= 0}
              />
            )}
            <Button title="Close" variant="outline" onPress={() => setViewingBill(null)} />
          </Card>
        </View>
      </Modal>

      {/* ADD BILL MODAL */}
      <Modal visible={showBillForm} animationType="slide" onRequestClose={() => setShowBillForm(false)}>
        <View style={styles.modal}>
          <ScreenHeader title="Add Bill" />
          <ScrollView contentContainerStyle={styles.modalContent}>
            <FieldLabel>Bill Number (optional)</FieldLabel>
            <Input
              placeholder="Vendor's invoice number"
              value={billForm.billNumber}
              onChangeText={(v) => setBillForm((f) => ({ ...f, billNumber: v }))}
            />

            <FieldLabel>Bill Date</FieldLabel>
            <DatePicker value={billForm.billDate} onChange={(v) => setBillForm((f) => ({ ...f, billDate: v }))} mode="date" />

            <View style={styles.itemsHeader}>
              <FieldLabel>Items (optional)</FieldLabel>
              <Button title="+ Add Item" variant="outline" onPress={addBillItemRow} style={styles.smallBtn} />
            </View>

            {billForm.items.map((item, index) => (
              <Card key={item.id} style={styles.itemRow}>
                <SelectPicker
                  items={products.map((p) => ({ id: p.id, label: p.name }))}
                  value={item.productId}
                  onChange={(id) => handleBillItemChange(index, 'productId', id)}
                  placeholder="Select item"
                  title="Select Item"
                />
                <View style={styles.rowInputs}>
                  <Input
                    placeholder="Qty"
                    keyboardType="numeric"
                    value={item.quantity}
                    onChangeText={(v) => handleBillItemChange(index, 'quantity', v)}
                    style={{ flex: 1 }}
                  />
                  <Input
                    placeholder="Unit Price"
                    keyboardType="numeric"
                    value={item.unitPrice}
                    onChangeText={(v) => handleBillItemChange(index, 'unitPrice', v)}
                    style={{ flex: 1 }}
                  />
                </View>
                <View style={styles.itemLine}>
                  <Text style={styles.meta}>
                    Sub Total: Rs {(Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(0)}
                  </Text>
                  <Pressable onPress={() => removeBillItemRow(index)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              </Card>
            ))}

            <FieldLabel>
              Bill Amount {billForm.items.length > 0 ? '(auto totalled from items above)' : ''}
            </FieldLabel>
            <Input
              placeholder="Total bill amount"
              keyboardType="numeric"
              editable={billForm.items.length === 0}
              value={billForm.items.length > 0 ? String(itemsSubTotal) : billForm.billAmount}
              onChangeText={(v) => setBillForm((f) => ({ ...f, billAmount: v }))}
            />

            <FieldLabel>Note (optional)</FieldLabel>
            <Input
              placeholder="Any additional detail about this bill"
              value={billForm.note}
              onChangeText={(v) => setBillForm((f) => ({ ...f, note: v }))}
            />

            <View style={styles.formActions}>
              <Button title="Cancel" variant="outline" onPress={() => setShowBillForm(false)} style={{ flex: 1 }} />
              <Button
                title="Save Bill"
                onPress={handleSaveBill}
                loading={savingBill}
                disabled={billForm.items.filter((i) => i.productId).length === 0 && !Number(billForm.billAmount)}
                style={{ flex: 1 }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ADD / EDIT PAYMENT MODAL */}
      <Modal visible={showPaymentForm} animationType="slide" onRequestClose={closePaymentForm}>
        <View style={styles.modal}>
          <ScreenHeader title={editingPaymentId ? 'Edit Payment' : 'Add Payment'} />
          <ScrollView contentContainerStyle={styles.modalContent}>
            {vendorOutstanding > 0 && (
              <View style={styles.quickRow}>
                <Button
                  title={`Full amount (Rs ${vendorOutstanding.toFixed(0)})`}
                  variant="outline"
                  onPress={() => setPaymentForm((f) => ({ ...f, amountPaid: vendorOutstanding.toFixed(2) }))}
                  style={{ flex: 1 }}
                />
                <Button
                  title={`Half (Rs ${(vendorOutstanding / 2).toFixed(0)})`}
                  variant="outline"
                  onPress={() => setPaymentForm((f) => ({ ...f, amountPaid: (vendorOutstanding / 2).toFixed(2) }))}
                  style={{ flex: 1 }}
                />
              </View>
            )}

            <FieldLabel>Date</FieldLabel>
            <DatePicker
              value={paymentForm.paymentDate}
              onChange={(v) => setPaymentForm((f) => ({ ...f, paymentDate: v }))}
              mode="date"
            />

            <FieldLabel>Payment Mode</FieldLabel>
            <View style={styles.chipRow}>
              {PAYMENT_MODES.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setPaymentForm((f) => ({ ...f, paymentMode: m }))}
                  style={[styles.chip, paymentForm.paymentMode === m && styles.chipActive]}
                >
                  <Text style={[styles.chipText, paymentForm.paymentMode === m && styles.chipTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>

            <FieldLabel>Amount Paid</FieldLabel>
            <Input
              placeholder="Amount actually received"
              keyboardType="numeric"
              value={paymentForm.amountPaid}
              onChangeText={(v) => setPaymentForm((f) => ({ ...f, amountPaid: v }))}
            />
            {paymentExceedsOutstanding && (
              <Text style={styles.errorText}>
                Rs {(paymentFormTotal - paymentAvailableRoom).toFixed(2)} more than the outstanding balance (Rs{' '}
                {paymentAvailableRoom.toFixed(2)}).
              </Text>
            )}

            <FieldLabel>Balance Adjustment (optional)</FieldLabel>
            <Input
              placeholder="e.g. rounding difference being written off"
              keyboardType="numeric"
              value={paymentForm.balanceAdjustment}
              onChangeText={(v) => setPaymentForm((f) => ({ ...f, balanceAdjustment: v }))}
            />
            <Text style={styles.helperText}>
              Lowers the balance without a real payment. Can be entered alongside or instead of Amount Paid.
            </Text>

            <FieldLabel>Transaction ID / Cheque No. (optional)</FieldLabel>
            <Input
              placeholder="UPI ref, cheque no., etc."
              value={paymentForm.transactionId}
              onChangeText={(v) => setPaymentForm((f) => ({ ...f, transactionId: v }))}
            />

            <FieldLabel>Note</FieldLabel>
            <Input
              placeholder="Optional"
              value={paymentForm.note}
              onChangeText={(v) => setPaymentForm((f) => ({ ...f, note: v }))}
            />

            <View style={styles.formActions}>
              <Button title="Cancel" variant="outline" onPress={closePaymentForm} style={{ flex: 1 }} />
              <Button
                title={editingPaymentId ? 'Update' : 'Save'}
                onPress={handleSavePayment}
                loading={savingPayment}
                disabled={
                  (!Number(paymentForm.amountPaid) && !Number(paymentForm.balanceAdjustment)) ||
                  paymentExceedsOutstanding
                }
                style={{ flex: 1 }}
              />
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
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  totalCard: { gap: 2 },
  totalLabel: { fontSize: 12, color: colors.textMuted },
  totalValue: { fontSize: 22, fontWeight: '700', color: colors.success, marginTop: 2 },
  negativeValue: { color: colors.danger },
  helperText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalContent: { padding: 16, paddingTop: 12, paddingBottom: 40, gap: 10 },
  balanceCard: { gap: 10 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  paymentAmount: { fontSize: 14, fontWeight: '700', color: colors.success },
  closeBtn: { margin: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.pillText, marginTop: 6 },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.pill },
  chipActive: { backgroundColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.pillText },
  chipTextActive: { color: '#fff' },
  errorText: { fontSize: 12, color: colors.danger, marginTop: -4 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  smallBtn: { height: 36, paddingHorizontal: 12 },
  itemRow: { gap: 8 },
  rowInputs: { flexDirection: 'row', gap: 10 },
  itemLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { gap: 10 },
  formTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  exportRow: { flexDirection: 'row', gap: 8 },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  exportBtnText: { fontSize: 13, fontWeight: '600', color: colors.pillText },
});
