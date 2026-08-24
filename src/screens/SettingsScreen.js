import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import ScreenHeader from '../components/ScreenHeader';
import SearchBar from '../components/SearchBar';
import { Button, Card, EmptyState, Input, Pill } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { categoriesApi, departmentsApi, unitsApi, vendorsApi } from '../services/api';
import { colors, radius } from '../theme';

const TABS = [
  { key: 'categories', label: 'Categories', singular: 'Category', api: categoriesApi },
  { key: 'departments', label: 'Departments', singular: 'Department', api: departmentsApi },
  { key: 'units', label: 'Units', singular: 'Unit', api: unitsApi },
  { key: 'vendors', label: 'Vendors', singular: 'Vendor', api: vendorsApi },
];

const DELETE_WARNINGS = {
  categories: 'Are you sure you want to delete this category? Products using it will be left without a category.',
  departments: 'Are you sure you want to delete this department?',
  units: 'Are you sure you want to delete this unit?',
  vendors: 'Are you sure you want to delete this vendor?',
};

const emptyForm = () => ({
  id: null,
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  gst_number: '',
  notes: '',
  is_active: true,
  sub_unit: '',
  conversion_factor: '',
  packSizes: [],
  removedPackSizeIds: [],
});

const emptyDraftPackSize = () => ({ name: '', pack_quantity: '' });

export default function SettingsScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState('categories');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [showAddPackSize, setShowAddPackSize] = useState(false);
  const [draftPackSize, setDraftPackSize] = useState(emptyDraftPackSize());

  const activeTab = TABS.find((t) => t.key === tab);
  const isUnits = tab === 'units';
  const isVendors = tab === 'vendors';
  const hasStatus = tab === 'departments' || tab === 'units' || tab === 'vendors';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await activeTab.api.list();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setSearch('');
    load();
  }, [load]);

  const openAdd = () => {
    setForm(emptyForm());
    setDraftPackSize(emptyDraftPackSize());
    setShowAddPackSize(false);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setForm({
      id: item.id,
      name: item.name,
      contact_person: item.contact_person || '',
      phone: item.phone || '',
      email: item.email || '',
      address: item.address || '',
      gst_number: item.gst_number || '',
      notes: item.notes || '',
      is_active: item.is_active ?? true,
      sub_unit: item.sub_unit || '',
      conversion_factor: item.conversion_factor ?? '',
      packSizes: item.pack_sizes || [],
      removedPackSizeIds: [],
    });
    setDraftPackSize(emptyDraftPackSize());
    setShowAddPackSize(false);
    setShowForm(true);
  };

  const confirmDraftPackSize = () => {
    if (!draftPackSize.name.trim() || !Number(draftPackSize.pack_quantity)) {
      Alert.alert('Missing details', 'Enter a name and how many it contains.');
      return;
    }
    setForm((f) => ({
      ...f,
      packSizes: [
        ...f.packSizes,
        {
          id: `draft-${Date.now()}`,
          isDraft: true,
          name: draftPackSize.name.trim(),
          pack_quantity: Number(draftPackSize.pack_quantity),
        },
      ],
    }));
    setDraftPackSize(emptyDraftPackSize());
    setShowAddPackSize(false);
  };

  const removePackSizeRow = (pack) => {
    setForm((f) => ({
      ...f,
      packSizes: f.packSizes.filter((p) => p.id !== pack.id),
      removedPackSizeIds: pack.isDraft ? f.removedPackSizeIds : [...f.removedPackSizeIds, pack.id],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Missing field', `Please enter a ${activeTab.singular.toLowerCase()} name.`);
      return;
    }
    if (isUnits && form.sub_unit.trim() && !form.conversion_factor) {
      Alert.alert('Missing field', 'Please enter a conversion factor for the smaller unit.');
      return;
    }
    setSaving(true);
    try {
      let payload;
      if (isUnits) {
        payload = {
          name: form.name.trim(),
          sub_unit: form.sub_unit.trim() || null,
          conversion_factor: form.sub_unit.trim() ? Number(form.conversion_factor) : null,
          is_active: form.is_active,
        };
      } else if (isVendors) {
        payload = {
          name: form.name.trim(),
          contact_person: form.contact_person.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          gst_number: form.gst_number.trim() || null,
          notes: form.notes.trim() || null,
          is_active: form.is_active,
        };
      } else if (tab === 'departments') {
        payload = { name: form.name.trim(), is_active: form.is_active };
      } else {
        payload = { name: form.name.trim() };
      }

      const saved = form.id ? await activeTab.api.update(form.id, payload) : await activeTab.api.create(payload);

      if (isUnits) {
        await Promise.all(form.removedPackSizeIds.map((id) => unitsApi.removePackSize(id)));
        await Promise.all(
          form.packSizes
            .filter((p) => p.isDraft)
            .map((p) => unitsApi.createPackSize(saved.id, { name: p.name, pack_quantity: p.pack_quantity })),
        );
      }

      setShowForm(false);
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert(item.name, DELETE_WARNINGS[tab], [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await activeTab.api.remove(item.id);
            await load();
          } catch (err) {
            Alert.alert('Failed', err.message || 'Could not delete.');
          }
        },
      },
    ]);
  };

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const haystack = [item.name, item.sub_unit, item.contact_person, item.phone, item.email].filter(Boolean);
    return haystack.some((v) => v.toLowerCase().includes(term));
  });

  return (
    <View style={styles.container}>
      <ScreenHeader title="Settings" />

      <Card style={styles.profileCard}>
        <Text style={styles.profileName}>{user?.full_name || user?.username}</Text>
        <Text style={styles.profileRole}>{user?.role}</Text>
      </Card>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Button title={`+ Add ${activeTab.singular}`} onPress={openAdd} style={{ marginBottom: 12 }} />
            <SearchBar
              placeholder={`Search ${activeTab.label.toLowerCase()}...`}
              value={search}
              onChangeText={setSearch}
              style={{ marginBottom: 12 }}
            />
          </>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 25).duration(250)}>
            <Card style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTitleLine}>
                  <Text style={styles.rowText}>{item.name}</Text>
                  {hasStatus && (
                    <Pill label={item.is_active ? 'Active' : 'Inactive'} tone={item.is_active ? 'success' : 'default'} />
                  )}
                </View>
                {isUnits && (item.sub_unit || item.pack_sizes?.length > 0) && (
                  <Text style={styles.rowMeta}>
                    {[
                      item.sub_unit ? `1 ${item.name} = ${item.conversion_factor} ${item.sub_unit}` : null,
                      ...(item.pack_sizes || []).map((p) => `1 ${p.name} = ${p.pack_quantity} ${item.name}`),
                    ]
                      .filter(Boolean)
                      .join(' | ')}
                  </Text>
                )}
                {isVendors && (item.contact_person || item.phone || item.email) && (
                  <Text style={styles.rowMeta}>
                    {[item.contact_person, item.phone, item.email].filter(Boolean).join(' · ')}
                  </Text>
                )}
                <View style={styles.actionRow}>
                  <Pressable onPress={() => openEdit(item)}>
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(item)}>
                    <Text style={styles.removeText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          </Animated.View>
        )}
        ListEmptyComponent={!loading && <EmptyState text={`No ${activeTab.label.toLowerCase()} yet.`} />}
        ListFooterComponent={
          <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
            <View style={styles.modal}>
              <ScreenHeader title={form.id ? `Edit ${activeTab.singular}` : `Add ${activeTab.singular}`} />
              <ScrollView contentContainerStyle={styles.modalContent}>
                <FieldLabel required>{isUnits ? 'Unit Name' : 'Name'}</FieldLabel>
                <Input
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder={
                    tab === 'categories'
                      ? 'e.g. Beverages'
                      : tab === 'departments'
                        ? 'e.g. Kitchen'
                        : isUnits
                          ? 'e.g. Kg, pcs'
                          : 'e.g. Sharma Kirana'
                  }
                />
                {isUnits && <Text style={styles.helperText}>This is what stock quantities are counted in.</Text>}

                {isVendors && (
                  <>
                    <FieldLabel>Contact Person</FieldLabel>
                    <Input
                      value={form.contact_person}
                      onChangeText={(v) => setForm((f) => ({ ...f, contact_person: v }))}
                    />
                    <FieldLabel>Phone</FieldLabel>
                    <Input
                      keyboardType="phone-pad"
                      value={form.phone}
                      onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                    />
                    <FieldLabel>Email</FieldLabel>
                    <Input
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={form.email}
                      onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                    />
                    <FieldLabel>GST Number</FieldLabel>
                    <Input value={form.gst_number} onChangeText={(v) => setForm((f) => ({ ...f, gst_number: v }))} />
                    <FieldLabel>Address</FieldLabel>
                    <Input
                      multiline
                      numberOfLines={2}
                      value={form.address}
                      onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
                      style={styles.textArea}
                    />
                    <FieldLabel>Notes</FieldLabel>
                    <Input
                      multiline
                      numberOfLines={2}
                      value={form.notes}
                      onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                      style={styles.textArea}
                    />
                  </>
                )}

                {hasStatus && (
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Active</Text>
                    <Switch
                      value={form.is_active}
                      onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                    />
                  </View>
                )}

                {isUnits && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.sectionLabel}>Also Counted As (optional)</Text>
                    <Text style={styles.helperText}>
                      Other ways this item is bought or issued - stock is always tracked in the unit name above, but
                      you can enter quantities in these too and they'll convert automatically.
                    </Text>

                    {(form.sub_unit || form.packSizes.length > 0) && (
                      <View style={{ gap: 8, marginTop: 8 }}>
                        {form.sub_unit && (
                          <View style={styles.packRow}>
                            <Text style={styles.packRowText}>
                              Smaller unit: {form.sub_unit} (1 {form.name || 'unit'} = {form.conversion_factor || '?'}{' '}
                              {form.sub_unit})
                            </Text>
                            <Pressable
                              onPress={() => setForm((f) => ({ ...f, sub_unit: '', conversion_factor: '' }))}
                            >
                              <Text style={styles.removeText}>Remove</Text>
                            </Pressable>
                          </View>
                        )}
                        {form.packSizes.map((pack) => (
                          <View key={pack.id} style={styles.packRow}>
                            <Text style={styles.packRowText}>
                              Pack: {pack.name} (1 {pack.name} = {pack.pack_quantity} {form.name || 'unit'})
                            </Text>
                            <Pressable onPress={() => removePackSizeRow(pack)}>
                              <Text style={styles.removeText}>Remove</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}

                    {!form.sub_unit && (
                      <View style={styles.rowInputs}>
                        <View style={{ flex: 1 }}>
                          <FieldLabel>Smaller unit name (optional)</FieldLabel>
                          <Input
                            placeholder="e.g. g"
                            value={form.sub_unit}
                            onChangeText={(v) => setForm((f) => ({ ...f, sub_unit: v }))}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <FieldLabel>1 {form.name || 'unit'} equals how many?</FieldLabel>
                          <Input
                            placeholder="e.g. 1000"
                            keyboardType="numeric"
                            value={String(form.conversion_factor)}
                            onChangeText={(v) => setForm((f) => ({ ...f, conversion_factor: v }))}
                          />
                        </View>
                      </View>
                    )}

                    {!showAddPackSize ? (
                      <Button
                        title="+ Add a pack size (e.g. Box, Case)"
                        variant="outline"
                        onPress={() => setShowAddPackSize(true)}
                        style={{ marginTop: 10 }}
                      />
                    ) : (
                      <Card style={{ marginTop: 10, gap: 8 }}>
                        <FieldLabel>Pack name</FieldLabel>
                        <Input
                          placeholder="e.g. Box"
                          value={draftPackSize.name}
                          onChangeText={(v) => setDraftPackSize((p) => ({ ...p, name: v }))}
                        />
                        <FieldLabel>Contains how many {form.name || 'units'}?</FieldLabel>
                        <Input
                          placeholder="e.g. 12"
                          keyboardType="numeric"
                          value={draftPackSize.pack_quantity}
                          onChangeText={(v) => setDraftPackSize((p) => ({ ...p, pack_quantity: v }))}
                        />
                        <View style={styles.formActions}>
                          <Button
                            title="Cancel"
                            variant="outline"
                            onPress={() => {
                              setShowAddPackSize(false);
                              setDraftPackSize(emptyDraftPackSize());
                            }}
                            style={{ flex: 1 }}
                          />
                          <Button title="Add" onPress={confirmDraftPackSize} style={{ flex: 1 }} />
                        </View>
                      </Card>
                    )}
                  </>
                )}

                <View style={styles.modalActions}>
                  <Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} style={{ flex: 1 }} />
                  <Button
                    title={saving ? 'Saving...' : isUnits ? 'Save Unit' : 'Save'}
                    onPress={handleSave}
                    loading={saving}
                    style={{ flex: 1 }}
                  />
                </View>
              </ScrollView>
            </View>
          </Modal>
        }
      />
    </View>
  );
}

function FieldLabel({ children, required }) {
  return (
    <Text style={styles.fieldLabel}>
      {children}
      {required && <Text style={styles.requiredMark}> *</Text>}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  profileCard: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  profileRole: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.pill,
  },
  tabActive: {
    backgroundColor: colors.ink,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.pillText,
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  actionRow: { flexDirection: 'row', gap: 14, marginTop: 8 },
  editText: { fontSize: 12, color: colors.ink, fontWeight: '600' },
  removeText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
  },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalContent: { padding: 16, paddingTop: 12, gap: 10, paddingBottom: 40 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  formActions: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.pillText, marginTop: 6 },
  requiredMark: { color: colors.danger },
  helperText: { fontSize: 11, color: colors.textMuted, marginTop: -2 },
  textArea: { height: 70, paddingTop: 10, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  switchLabel: { fontSize: 14, color: colors.pillText, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.border, marginTop: 12, marginBottom: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  rowInputs: { flexDirection: 'row', gap: 10 },
  packRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.pill,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  packRowText: { fontSize: 12, color: colors.pillText, flex: 1, marginRight: 8 },
});
