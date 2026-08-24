import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import DonutChart from '../components/DonutChart';
import ScreenHeader from '../components/ScreenHeader';
import { Button, Card, EmptyState, Pill, SectionTitle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { categoriesApi, productsApi, stockApi } from '../services/api';
import { colors, radius } from '../theme';

const REPORT_PERIODS = [
  { value: 'today', label: 'Today', days: 0 },
  { value: '7d', label: '7 Days', days: 7 },
  { value: '15d', label: '15 Days', days: 15 },
  { value: '1m', label: '1 Month', days: 30 },
  { value: '3m', label: '3 Months', days: 90 },
  { value: '6m', label: '6 Months', days: 180 },
  { value: '1y', label: '1 Year', days: 365 },
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EXPIRY_SOON_DAYS = 7;
const CATEGORY_COLORS = ['#0d6efd', '#20c997', '#ffc107', '#fd7e14', '#dc3545', '#6f42c1', '#0dcaf0', '#adb5bd'];

function getExpiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  const daysLeft = Math.round((expiry - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: 'Expired', daysLeft };
  if (daysLeft <= EXPIRY_SOON_DAYS) return { label: 'Expiring Soon', daysLeft };
  return null;
}

export default function DashboardScreen() {
  const { activeBranchId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stockByProduct, setStockByProduct] = useState({});
  const [movements, setMovements] = useState([]);
  const [reportPeriod, setReportPeriod] = useState('7d');
  const [loggingWastage, setLoggingWastage] = useState({});

  const load = useCallback(async () => {
    try {
      const [productList, categoryList, levels, movementList] = await Promise.all([
        productsApi.list(),
        categoriesApi.list(),
        stockApi.levels(),
        stockApi.movements(),
      ]);
      setProducts(productList);
      setCategories(categoryList);

      const byProduct = {};
      levels
        .filter((l) => l.warehouse_id === activeBranchId)
        .forEach((l) => {
          byProduct[l.product_id] = (byProduct[l.product_id] || 0) + Number(l.quantity || 0);
        });
      setStockByProduct(byProduct);
      setMovements(movementList.filter((m) => m.warehouse_id === activeBranchId));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const productById = Object.fromEntries(products.map((p) => [p.id, p]));

  const totalItems = products.length;
  const inventoryValue = products.reduce(
    (sum, p) => sum + (stockByProduct[p.id] || 0) * Number(p.purchase_price || 0),
    0,
  );
  const lowStockProducts = products.filter((p) => {
    const qty = stockByProduct[p.id] || 0;
    return p.min_stock > 0 && qty > 0 && qty <= p.min_stock;
  });
  const outOfStockProducts = products.filter((p) => p.min_stock > 0 && (stockByProduct[p.id] || 0) === 0);
  const expiringProducts = products
    .filter((p) => (stockByProduct[p.id] || 0) > 0 && getExpiryStatus(p.expiry_date))
    .map((p) => ({ ...p, expiryInfo: getExpiryStatus(p.expiry_date) }))
    .sort((a, b) => a.expiryInfo.daysLeft - b.expiryInfo.daysLeft);

  const summaryCards = [
    { title: 'Total Items', value: String(totalItems), subtitle: 'Across all categories' },
    { title: 'Inventory Cost Value', value: `Rs ${inventoryValue.toLocaleString()}`, subtitle: 'Cost of Stock on Hand' },
    { title: 'Low Stock', value: String(lowStockProducts.length), subtitle: 'Needs Reorder', tone: 'warning' },
    { title: 'Out of Stock', value: String(outOfStockProducts.length), subtitle: 'Immediate Action', tone: 'danger' },
    { title: 'Expiring / Expired', value: String(expiringProducts.length), subtitle: 'Check and log wastage', tone: 'danger' },
  ];

  const handleLogWastage = async (product) => {
    const currentStock = stockByProduct[product.id] || 0;
    if (currentStock <= 0) return;
    setLoggingWastage((prev) => ({ ...prev, [product.id]: true }));
    try {
      await stockApi.adjust({
        product_id: product.id,
        warehouse_id: activeBranchId,
        quantity: -currentStock,
        movement_type: 'wastage',
        note: 'Wastage - Expired',
      });
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Failed to log wastage.');
    } finally {
      setLoggingWastage((prev) => ({ ...prev, [product.id]: false }));
    }
  };

  const confirmLogWastage = (product) => {
    const currentStock = stockByProduct[product.id] || 0;
    Alert.alert(
      'Log Wastage',
      `Log all ${currentStock} ${product.unit_of_measure} of ${product.name} as wastage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Wastage', style: 'destructive', onPress: () => handleLogWastage(product) },
      ],
    );
  };

  const selectedPeriod = REPORT_PERIODS.find((p) => p.value === reportPeriod) || REPORT_PERIODS[1];
  const { weeklySummary, recentActivities, topConsumed } = useMemo(() => {
    const periodStart = new Date();
    periodStart.setHours(0, 0, 0, 0);
    periodStart.setDate(periodStart.getDate() - selectedPeriod.days);
    const periodMovements = movements.filter((m) => new Date(m.created_at) >= periodStart);

    const periodIn = periodMovements.filter((m) => m.movement_type === 'in' || (m.movement_type === 'adjustment' && m.quantity > 0));
    const periodOut = periodMovements.filter((m) => m.movement_type === 'out' || (m.movement_type === 'adjustment' && m.quantity < 0));
    const periodWastage = periodMovements.filter((m) => m.movement_type === 'wastage');

    const costOf = (m) => Math.abs(m.quantity) * Number(productById[m.product_id]?.purchase_price || 0);
    const fmt = (n) => Number(n.toFixed(2)).toLocaleString();

    const weeklySummary = [
      {
        title: `Purchased (${selectedPeriod.label})`,
        value: `Rs ${fmt(periodIn.reduce((s, m) => s + costOf(m), 0))}`,
        subtitle: `${fmt(periodIn.reduce((s, m) => s + Number(m.quantity || 0), 0))} units received`,
        tone: 'success',
      },
      {
        title: `Consumed (${selectedPeriod.label})`,
        value: `Rs ${fmt(periodOut.reduce((s, m) => s + costOf(m), 0))}`,
        subtitle: `${fmt(periodOut.reduce((s, m) => s + Math.abs(m.quantity), 0))} units issued`,
        tone: 'default',
      },
      {
        title: `Wasted (${selectedPeriod.label})`,
        value: `Rs ${fmt(periodWastage.reduce((s, m) => s + costOf(m), 0))}`,
        subtitle: `${fmt(periodWastage.reduce((s, m) => s + Math.abs(m.quantity), 0))} units wasted`,
        tone: 'danger',
      },
    ];

    const recentActivities = [...movements]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6)
      .map((m) => {
        const product = productById[m.product_id];
        const isIn = m.movement_type === 'in' || (m.movement_type === 'adjustment' && m.quantity > 0);
        const isWastage = m.movement_type === 'wastage';
        return {
          id: m.id,
          type: isWastage ? 'Wastage' : isIn ? 'Stock In' : 'Stock Out',
          item: product?.name || `Product #${m.product_id}`,
          quantity: `${isIn ? '+' : '-'}${Math.abs(m.quantity)} ${product?.unit_of_measure || ''}`,
          date: new Date(m.created_at).toLocaleString(),
          tone: isWastage ? 'warning' : isIn ? 'success' : 'danger',
        };
      });

    const topConsumed = Object.values(
      [...periodOut, ...periodWastage].reduce((acc, m) => {
        const key = m.product_id;
        if (!acc[key]) acc[key] = { productId: key, quantity: 0, cost: 0 };
        acc[key].quantity += Math.abs(m.quantity);
        acc[key].cost += costOf(m);
        return acc;
      }, {}),
    )
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    return { weeklySummary, recentActivities, topConsumed };
  }, [movements, productById, selectedPeriod]);

  // Inventory trend: stock in vs out vs wastage per month, current year.
  const trendData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const stockIn = new Array(12).fill(0);
    const stockOut = new Array(12).fill(0);
    const wastage = new Array(12).fill(0);
    movements.forEach((m) => {
      const date = new Date(m.created_at);
      if (date.getFullYear() !== currentYear) return;
      const month = date.getMonth();
      if (m.movement_type === 'in') stockIn[month] += Number(m.quantity || 0);
      else if (m.movement_type === 'out') stockOut[month] += Math.abs(m.quantity);
      else if (m.movement_type === 'wastage') wastage[month] += Math.abs(m.quantity);
      else if (m.movement_type === 'adjustment') {
        if (Number(m.quantity) > 0) stockIn[month] += Number(m.quantity || 0);
        else stockOut[month] += Math.abs(m.quantity);
      }
    });
    return { stockIn, stockOut, wastage, max: Math.max(1, ...stockIn, ...stockOut, ...wastage) };
  }, [movements]);

  // Category wise stock (top 7 + "Other Categories").
  const categoryStock = useMemo(() => {
    const all = categories
      .map((cat) => ({
        category: cat.name,
        quantity: products.filter((p) => p.category_id === cat.id).reduce((sum, p) => sum + (stockByProduct[p.id] || 0), 0),
      }))
      .filter((c) => c.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity);
    const limited =
      all.length > 7
        ? [...all.slice(0, 7), { category: 'Other Categories', quantity: all.slice(7).reduce((s, c) => s + c.quantity, 0) }]
        : all;
    const total = limited.reduce((s, c) => s + c.quantity, 0);
    return { rows: limited, total };
  }, [categories, products, stockByProduct]);

  // Department wise consumption (Stock Out + Wastage, grouped by reference), all-time.
  const departmentConsumption = useMemo(() => {
    const totals = {};
    movements
      .filter((m) => m.movement_type === 'out' || m.movement_type === 'wastage')
      .forEach((m) => {
        const dept = m.reference || 'Unspecified';
        const cost = Math.abs(m.quantity) * Number(productById[m.product_id]?.purchase_price || 0);
        if (!totals[dept]) totals[dept] = { department: dept, cost: 0 };
        totals[dept].cost += cost;
      });
    return Object.values(totals).sort((a, b) => b.cost - a.cost);
  }, [movements, productById]);
  const departmentMax = Math.max(1, ...departmentConsumption.map((d) => d.cost));

  return (
    <View style={styles.container}>
      <ScreenHeader title="Stock Dashboard" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.grid}>
          {summaryCards.map((card, index) => (
            <StatCard key={card.title} index={index} {...card} />
          ))}
        </View>

        <SectionTitle>Inventory Trend ({new Date().getFullYear()})</SectionTitle>
        <Card>
          <View style={styles.legendRow}>
            <LegendDot color={colors.ink} label="Stock In" />
            <LegendDot color={colors.danger} label="Stock Out" />
            <LegendDot color={colors.warning} label="Wastage" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.trendChart}>
              {MONTH_LABELS.map((label, i) => (
                <View key={label} style={styles.trendColumn}>
                  <View style={styles.trendBars}>
                    <View style={[styles.trendBar, { height: (trendData.stockIn[i] / trendData.max) * 90, backgroundColor: colors.ink }]} />
                    <View style={[styles.trendBar, { height: (trendData.stockOut[i] / trendData.max) * 90, backgroundColor: colors.danger }]} />
                    <View style={[styles.trendBar, { height: (trendData.wastage[i] / trendData.max) * 90, backgroundColor: colors.warning }]} />
                  </View>
                  <Text style={styles.trendLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Card>

        <SectionTitle>Category Wise Stock</SectionTitle>
        <Card>
          {categoryStock.rows.length === 0 ? (
            <EmptyState text="No stock to categorize yet." />
          ) : (
            <DonutChart
              data={categoryStock.rows.map((c, i) => ({
                label: c.category,
                value: c.quantity,
                color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
              }))}
              centerValue={Math.round(categoryStock.total).toLocaleString()}
              centerLabel="Total Items"
            />
          )}
        </Card>

        <SectionTitle>Expiry Alerts</SectionTitle>
        <Card>
          {expiringProducts.length === 0 ? (
            <EmptyState text="Nothing expiring soon." />
          ) : (
            expiringProducts.map((product, idx) => (
              <Animated.View
                entering={FadeInDown.delay(idx * 40).duration(300)}
                key={product.id}
                style={[styles.alertRow, idx === expiringProducts.length - 1 && styles.alertRowLast]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertName}>{product.name}</Text>
                  <Text style={styles.alertMeta}>
                    {stockByProduct[product.id]} {product.unit_of_measure} · {product.expiry_date}
                  </Text>
                </View>
                <Pill
                  label={product.expiryInfo.label}
                  tone={product.expiryInfo.label === 'Expired' ? 'danger' : 'warning'}
                />
                <Button
                  title="Log Wastage"
                  variant="danger"
                  loading={!!loggingWastage[product.id]}
                  onPress={() => confirmLogWastage(product)}
                  style={styles.logWastageBtn}
                />
              </Animated.View>
            ))
          )}
        </Card>

        <SectionTitle>Period Report</SectionTitle>
        <View style={styles.chipRow}>
          {REPORT_PERIODS.map((p) => (
            <Pressable
              key={p.value}
              onPress={() => setReportPeriod(p.value)}
              style={[styles.chip, reportPeriod === p.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, reportPeriod === p.value && styles.chipTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.grid}>
          {weeklySummary.map((card, index) => (
            <StatCard key={card.title} index={index} wide {...card} />
          ))}
        </View>

        <SectionTitle>Top Consumed Items ({selectedPeriod.label})</SectionTitle>
        <Card>
          {topConsumed.length === 0 ? (
            <EmptyState text="No consumption recorded this week." />
          ) : (
            topConsumed.map((row, idx) => {
              const product = productById[row.productId];
              return (
                <View key={row.productId} style={[styles.alertRow, idx === topConsumed.length - 1 && styles.alertRowLast]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertName}>{product?.name || `Product #${row.productId}`}</Text>
                    <Text style={styles.alertMeta}>
                      {row.quantity.toFixed(2)} {product?.unit_of_measure || ''}
                    </Text>
                  </View>
                  <Text style={styles.costText}>Rs {row.cost.toFixed(0)}</Text>
                </View>
              );
            })
          )}
        </Card>

        <SectionTitle>Department Wise Consumption</SectionTitle>
        <Card>
          {departmentConsumption.length === 0 ? (
            <EmptyState text="No consumption recorded yet." />
          ) : (
            departmentConsumption.map((d) => (
              <View key={d.department} style={styles.categoryRow}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryName}>{d.department}</Text>
                  <Text style={styles.categoryPct}>Rs {d.cost.toFixed(0)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(d.cost / departmentMax) * 100}%`, backgroundColor: colors.ink }]} />
                </View>
              </View>
            ))
          )}
        </Card>

        <SectionTitle>Low Stock Alert</SectionTitle>
        <Card>
          {loading ? (
            <EmptyState text="Loading..." />
          ) : lowStockProducts.length === 0 && outOfStockProducts.length === 0 ? (
            <EmptyState text="No stock alerts right now." />
          ) : (
            [...outOfStockProducts, ...lowStockProducts].slice(0, 10).map((product, idx, arr) => {
              const quantity = stockByProduct[product.id] || 0;
              return (
                <Animated.View
                  entering={FadeInDown.delay(idx * 40).duration(300)}
                  key={product.id}
                  style={[styles.alertRow, idx === arr.length - 1 && styles.alertRowLast]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertName}>{product.name}</Text>
                    <Text style={styles.alertMeta}>
                      {quantity} {product.unit_of_measure} left · min {product.min_stock}
                    </Text>
                  </View>
                  <Pill label={quantity === 0 ? 'Out of stock' : 'Low'} tone={quantity === 0 ? 'danger' : 'warning'} />
                </Animated.View>
              );
            })
          )}
        </Card>

        <SectionTitle>Recent Activity</SectionTitle>
        <Card>
          {recentActivities.length === 0 ? (
            <EmptyState text="No recent activity." />
          ) : (
            recentActivities.map((a, idx) => (
              <Animated.View
                entering={FadeInDown.delay(idx * 40).duration(300)}
                key={a.id}
                style={[styles.alertRow, idx === recentActivities.length - 1 && styles.alertRowLast]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertName}>
                    {a.type} · {a.item}
                  </Text>
                  <Text style={styles.alertMeta}>{a.date}</Text>
                </View>
                <Pill label={a.quantity} tone={a.tone} />
              </Animated.View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

function StatCard({ title, value, subtitle, tone = 'default', index = 0, wide = false }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).duration(350)}
      style={[styles.statCard, wide && styles.statCardWide]}
    >
      <Card>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={[styles.statValue, tone === 'warning' && { color: colors.warning }, tone === 'danger' && { color: colors.danger }]}>
          {value}
        </Text>
        <Text style={styles.statSubtitle}>{subtitle}</Text>
      </Card>
    </Animated.View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  statCardWide: {
    flexBasis: '100%',
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.pill,
  },
  chipActive: {
    backgroundColor: colors.ink,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.pillText,
  },
  chipTextActive: {
    color: '#fff',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  alertRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  alertName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  alertMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  logWastageBtn: {
    height: 32,
    paddingHorizontal: 10,
  },
  costText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
    paddingBottom: 4,
  },
  trendColumn: {
    alignItems: 'center',
    width: 40,
  },
  trendBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 90,
  },
  trendBar: {
    width: 8,
    borderRadius: 2,
    minHeight: 2,
  },
  trendLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 6,
  },
  categoryRow: {
    marginBottom: 14,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  categoryPct: {
    fontSize: 12,
    color: colors.textMuted,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
});
