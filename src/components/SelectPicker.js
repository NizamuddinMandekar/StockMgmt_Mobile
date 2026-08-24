import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';
import { Input } from './ui';

// Generic single-select picker: items is [{ id, label, meta? }]. Used for
// products, vendors, categories, etc. so the modal/search UX matches
// everywhere instead of every screen rolling its own.
export default function SelectPicker({ items, value, onChange, placeholder = 'Select', title = 'Select' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = items.find((i) => i.id === value);
  const filtered = items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={selected ? styles.triggerText : styles.triggerPlaceholder}>
          {selected ? selected.label : placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Input placeholder="Search..." value={query} onChangeText={setQuery} autoFocus />
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onChange(item.id);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <Text style={styles.rowText}>{item.label}</Text>
                {!!item.meta && <Text style={styles.rowMeta}>{item.meta}</Text>}
              </Pressable>
            )}
          />
          <Pressable style={styles.close} onPress={() => setOpen(false)}>
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  triggerText: {
    fontSize: 15,
    color: colors.text,
  },
  triggerPlaceholder: {
    fontSize: 15,
    color: colors.textFaint,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
    paddingHorizontal: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  list: {
    gap: 8,
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  rowText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  close: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
