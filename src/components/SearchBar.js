import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Input } from './ui';
import { colors, radius } from '../theme';

export default function SearchBar({ value, onChangeText, placeholder, style }) {
  return (
    <View style={[styles.searchBar, style]}>
      <Ionicons name="search-outline" size={18} color={colors.textFaint} />
      <Input
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        style={styles.searchInput}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.pill,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
});
