import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { createCreditPersona } from '../../../../services/pos/posApi';
import type { CreditPersona } from '../../../../services/pos/types';
import { toast } from '../../../../store/toastStore';
import { useMyanmarLocations } from '../../../preOrder/hooks/useMyanmarLocations';
import { YANGON_REGION_CODE } from '../../../preOrder/lib/preOrder';
import { colors } from '../../theme';
import BottomSheet from '../BottomSheet';
import { OptionPickerList } from '../OptionPickerSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (persona: CreditPersona) => void;
  allowLocation?: boolean;
}

export default function AddCustomerSheet({ visible, onClose, onCreated, allowLocation = false }: Props) {
  const { regions, yangonTownships, regionLabel, townshipLabel } = useMyanmarLocations();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('');
  const [township, setTownship] = useState('');
  const [picker, setPicker] = useState<'region' | 'township' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const closePicker = () => setPicker(null);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('အမည် ထည့်ပေးပါ');
      return;
    }
    if (!phone.trim()) {
      toast.error('ဖုန်းနံပါတ် ထည့်ပေးပါ');
      return;
    }
    if (region === YANGON_REGION_CODE && !township) {
      toast.error('မြို့နယ် ရွေးပေးပါ');
      return;
    }
    setIsSaving(true);
    const res = await createCreditPersona({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim() || undefined,
      region: region || undefined,
      township: township || undefined,
    });
    setIsSaving(false);

    if (!res.success || !res.data) {
      toast.error(res.message || 'အကြွေးပေးသူ ထည့်၍ မရပါ');
      return;
    }
    toast.success('အကြွေးပေးသူ ထည့်ပြီးပါပြီ');
    setName('');
    setPhone('');
    setAddress('');
    setRegion('');
    setTownship('');
    onCreated(res.data);
  };

  return (
    <BottomSheet
      visible={visible}
      title={picker === 'region' ? 'တိုင်း/ပြည်နယ်' : picker === 'township' ? 'မြို့နယ်' : 'အကြွေးပေးသူ အသစ်'}
      onClose={picker ? closePicker : onClose}
      footer={
        !picker && (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>မလုပ်တော့ပါ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.save} onPress={handleSave} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>သိမ်းမယ်</Text>}
            </TouchableOpacity>
          </View>
        )
      }
    >
      {picker ? (
        <OptionPickerList
          options={picker === 'region'
            ? [{ value: '', label: 'မရွေးပါ' }, ...regions.map(({ code, my }) => ({ value: code, label: my }))]
            : yangonTownships.map(({ code, my }) => ({ value: code, label: my }))}
          selected={picker === 'region' ? region : township}
          onSelect={(value) => {
            if (picker === 'township') {
              setTownship(value);
            } else if (value !== region) {
              setRegion(value);
              setTownship('');
            }
          }}
          onClose={closePicker}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>
            အမည် <Text style={styles.required}>*</Text>
          </Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="အမည်" />
          <Text style={styles.label}>
            ဖုန်း <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="09xxxxxxxxx"
            keyboardType="phone-pad"
          />
          {allowLocation && (
            <>
              <Text style={styles.label}>တိုင်း/ပြည်နယ်</Text>
              <TouchableOpacity style={styles.input} accessibilityRole="button" onPress={() => setPicker('region')}>
                <Text style={region ? styles.value : styles.placeholder}>
                  {region ? regionLabel(region) : 'တိုင်း/ပြည်နယ် ရွေးပါ'}
                </Text>
              </TouchableOpacity>
              {region === YANGON_REGION_CODE && (
                <>
                  <Text style={styles.label}>မြို့နယ် <Text style={styles.required}>*</Text></Text>
                  <TouchableOpacity style={styles.input} accessibilityRole="button" onPress={() => setPicker('township')}>
                    <Text style={township ? styles.value : styles.placeholder}>
                      {township ? townshipLabel(township) : 'မြို့နယ် ရွေးပါ'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
          <Text style={styles.label}>လိပ်စာ</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={address}
            onChangeText={setAddress}
            placeholder="(မထည့်လည်းရ)"
            multiline
          />
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: 20,
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 6,
  },
  required: {
    color: colors.danger,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  value: {
    color: colors.text,
  },
  placeholder: {
    color: colors.textFaint,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  cancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.primary,
    fontWeight: '700',
  },
  save: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
