import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, type } from '../theme';
import LogoMark from './LogoMark';

export default function ScreenHeader({ title, rightIcon, onRightPress }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const canGoBack = navigation.canGoBack();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      {canGoBack ? (
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
      ) : (
        <LogoMark size={32} imageSize={22} radius={8} />
      )}
      <Text style={[styles.title, { flex: 1 }]}>{title}</Text>
      {rightIcon && (
        <Pressable
          onPress={onRightPress}
          hitSlop={12}
          style={({ pressed }) => [styles.iconButton, styles.rightIconButton, pressed && styles.iconButtonPressed]}
        >
          <Ionicons name={rightIcon} size={22} color={colors.ink} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  iconButtonPressed: {
    backgroundColor: colors.pill,
  },
  rightIconButton: {
    marginLeft: 0,
    marginRight: -8,
  },
  title: {
    ...type.title,
    color: colors.text,
  },
});
