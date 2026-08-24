import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';

export default function SelectBranchScreen() {
  const { branches, chooseBranch } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select a branch</Text>
      <Text style={styles.subtitle}>Choose which warehouse you're working from.</Text>
      <FlatList
        data={branches}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => chooseBranch(item.id)}>
            <Text style={styles.rowText}>{item.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 20,
  },
  list: {
    gap: 10,
  },
  row: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  rowText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});
