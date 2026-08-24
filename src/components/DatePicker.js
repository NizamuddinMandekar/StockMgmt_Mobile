import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';

const toDate = (value, mode) => {
  if (!value) return new Date();
  if (mode === 'month') return new Date(`${value}-01T00:00:00`);
  return new Date(`${value}T00:00:00`);
};

const format = (date, mode) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return mode === 'month' ? `${y}-${m}` : `${y}-${m}-${d}`;
};

// Native date/month picker matching web's <input type="date"> / <input
// type="month"> - mode="month" still uses the native day picker (RN has no
// month-only native picker) but truncates the result to YYYY-MM.
export default function DatePicker({ value, onChange, mode = 'date', placeholder = 'Select date', maximumDate }) {
  const [open, setOpen] = useState(false);

  const handleValueChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setOpen(false);
    if (!selectedDate) return;
    onChange(format(selectedDate, mode));
  };

  const handleDismiss = () => setOpen(false);

  // @react-native-community/datetimepicker has no web implementation (it
  // renders null and just logs a warning there), so every DatePicker in the
  // app would otherwise be unopenable when running via `expo start --web`.
  // Fall back to the browser's native <input type="date"/"month"> instead.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.trigger}>
        <input
          type={mode === 'month' ? 'month' : 'date'}
          value={value || ''}
          max={maximumDate ? format(maximumDate, mode) : undefined}
          onChange={(e) => onChange(e.target.value)}
          style={webInputStyle}
        />
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
      </View>
    );
  }

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={value ? styles.triggerText : styles.triggerPlaceholder}>{value || placeholder}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
      </Pressable>

      {open && (
        <DateTimePicker
          value={toDate(value, mode)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onValueChange={handleValueChange}
          onDismiss={handleDismiss}
          maximumDate={maximumDate}
        />
      )}

      {open && Platform.OS === 'ios' && (
        <View style={styles.iosDoneRow}>
          <Pressable onPress={() => setOpen(false)} style={styles.iosDoneBtn}>
            <Text style={styles.iosDoneText}>Done</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

// Plain CSS (not an RN style array) since this backs a raw DOM <input/> on web.
const webInputStyle = {
  flex: 1,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 15,
  color: colors.text,
  fontFamily: 'inherit',
};

const styles = StyleSheet.create({
  trigger: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  iosDoneRow: {
    alignItems: 'flex-end',
    marginTop: -8,
    marginBottom: 8,
  },
  iosDoneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  iosDoneText: {
    color: colors.ink,
    fontWeight: '600',
  },
});
