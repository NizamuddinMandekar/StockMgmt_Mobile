import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import ScreenHeader from '../components/ScreenHeader';
import { Button } from '../components/ui';
import { colors } from '../theme';
import StockHistoryScreen from './StockHistoryScreen';
import StockInScreen from './StockInScreen';
import StockOutScreen from './StockOutScreen';

const SUB_TABS = ['Stock In', 'Stock Out', 'History'];

export default function StockHubScreen() {
  const [subTab, setSubTab] = useState('Stock In');

  return (
    <View style={styles.container}>
      <ScreenHeader title="Stock" />
      <View style={styles.subTabs}>
        {SUB_TABS.map((t) => (
          <Button
            key={t}
            title={t}
            variant={subTab === t ? 'primary' : 'outline'}
            onPress={() => setSubTab(t)}
            style={{ flex: 1 }}
          />
        ))}
      </View>
      {/* Kept mounted (not conditionally rendered) so switching sub-tabs
          doesn't wipe an in-progress form - matches how these screens
          behaved as separate always-mounted drawer screens before. */}
      <View style={subTab === 'Stock In' ? styles.visible : styles.hidden}>
        <StockInScreen embedded />
      </View>
      <View style={subTab === 'Stock Out' ? styles.visible : styles.hidden}>
        <StockOutScreen embedded />
      </View>
      <View style={subTab === 'History' ? styles.visible : styles.hidden}>
        <StockHistoryScreen embedded />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  subTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12, marginTop: 12 },
  visible: { flex: 1 },
  hidden: { display: 'none' },
});
