import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';

import { getTodayDateString } from '../../pos/lib';
import { colors } from '../../pos/theme';

interface Props {
  // YYYY-MM-DD, or '' for no date
  value: string;
  onChange: (value: string) => void;
  // YYYY-MM-DD; earlier days can't be picked
  minDate?: string;
}

const toDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Optional date: empty until picked, with a button to clear it again (the web's optional <input type="date">)
export default function ExpectedDateField({ value, onChange, minDate }: Props) {
  const minimumDate = minDate ? toDate(minDate) : undefined;
  const handlePicked = (_event: unknown, picked: Date) => onChange(getTodayDateString(picked));

  const openAndroidPicker = () =>
    DateTimePickerAndroid.open({
      value: value ? toDate(value) : minimumDate ?? new Date(),
      mode: 'date',
      minimumDate,
      onValueChange: handlePicked,
    });

  const clear = (
    <TouchableOpacity style={styles.clear} onPress={() => onChange('')} hitSlop={8} accessibilityLabel="ရက် ဖျက်မယ်">
      <Ionicons name="close" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  if (!value) {
    return (
      <TouchableOpacity
        style={styles.field}
        // iOS shows its compact picker once there is a date to show
        onPress={Platform.OS === 'ios' ? () => onChange(minDate || getTodayDateString()) : openAndroidPicker}
        activeOpacity={0.8}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={styles.placeholder}>ရက် ရွေးမယ်</Text>
      </TouchableOpacity>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.row}>
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display="compact"
          minimumDate={minimumDate}
          onValueChange={handlePicked}
        />
        {clear}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity style={[styles.field, styles.flex]} onPress={openAndroidPicker} activeOpacity={0.8}>
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text style={styles.value}>{value}</Text>
      </TouchableOpacity>
      {clear}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.surface,
  },
  placeholder: {
    fontSize: 15,
    color: colors.textFaint,
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  clear: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
