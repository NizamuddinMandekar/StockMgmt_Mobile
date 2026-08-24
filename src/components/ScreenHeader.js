import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';
import LogoMark from './LogoMark';

export default function ScreenHeader({ title }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <Pressable
        onPress={() => navigation.openDrawer()}
        hitSlop={12}
        style={styles.menuButton}
      >
        <View style={styles.bar} />
        <View style={styles.bar} />
        <View style={styles.bar} />
      </Pressable>
      <LogoMark size={32} imageSize={22} radius={8} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: colors.bg,
  },
  menuButton: {
    gap: 4,
    padding: 4,
  },
  bar: {
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.ink,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
});
