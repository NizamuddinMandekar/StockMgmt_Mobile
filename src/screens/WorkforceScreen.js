import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import AdminPasswordModal from '../components/AdminPasswordModal';
import DatePicker from '../components/DatePicker';
import ScreenHeader from '../components/ScreenHeader';
import SearchBar from '../components/SearchBar';
import SelectPicker from '../components/SelectPicker';
import { Button, Card, EmptyState, Input, Pill } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { attendanceApi, authApi, employeesApi, payrollApi, salaryAdvancesApi } from '../services/api';
import { colors, radius } from '../theme';
import { exportCsv, exportPdf, rowsToCsv } from '../utils/exportFile';

const TABS = ['Employees', 'Attendance', 'Payroll', 'Advances'];

const STATUS_OPTIONS = [
  { value: 'present', code: 'P', tone: 'success' },
  { value: 'absent', code: 'A', tone: 'danger' },
  { value: 'half_day', code: 'H', tone: 'warning' },
  { value: 'leave', code: 'L', tone: 'default' },
  { value: 'sick_leave', code: 'SL', tone: 'default' },
  { value: 'work_off', code: 'WO', tone: 'default' },
];

// Matches web's attendance-constants.js STATUS_OPTIONS labels, used for
// the CSV/PDF export column headers (the on-screen legend just shows the
// raw value with underscores replaced, but exports need the exact label).
const STATUS_LABELS = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half Day',
  leave: 'Leave',
  sick_leave: 'Sick Leave',
  work_off: 'Work Off',
};

// Matches the web app's Bootstrap badge colors for each attendance status.
const STATUS_COLORS = {
  present: '#16a34a',
  absent: '#dc3545',
  half_day: '#ffc107',
  leave: '#0dcaf0',
  sick_leave: '#6f42c1',
  work_off: '#6c757d',
};

const COL_NAME = 140;
const COL_DAY = 30;
const COL_SUMMARY = 36;

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStr = () => new Date().toISOString().slice(0, 7);

export default function WorkforceScreen() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('Employees');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setEmployees(await employeesApi.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // HR lands directly on this screen with no tab bar/More screen around it
  // (see MainNavigator) - it's their only destination, so unlike every other
  // role (who can log out from the More screen) they need a way to log out
  // right here. Every other role reaches Workforce via a stack push from
  // More, which already has its own logout entry, so this stays hidden then.
  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Workforce"
        rightIcon={user?.role === 'hr' ? 'log-out-outline' : undefined}
        onRightPress={confirmLogout}
      />
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            android_ripple={{ color: 'transparent' }}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'Employees' && <EmployeesTab employees={employees} loading={loading} reload={load} />}
      {tab === 'Attendance' && <AttendanceTab employees={employees} />}
      {tab === 'Payroll' && <PayrollTab employees={employees} />}
      {tab === 'Advances' && <AdvancesTab employees={employees} />}
    </View>
  );
}

const emptyEmployeeForm = () => ({
  id: null,
  full_name: '',
  email: '',
  phone: '',
  aadhar_number: '',
  designation: '',
  monthly_salary: '',
  joining_date: '',
  is_active: true,
  resigned_date: '',
  upi_id: '',
  bank_account_number: '',
  ifsc_code: '',
  note: '',
});

function validateEmployeeForm(form) {
  if (!form.full_name.trim()) return "Please enter the employee's name.";
  if (!form.monthly_salary || Number(form.monthly_salary) <= 0) return 'Please enter a monthly salary greater than zero.';
  if (!form.phone.trim()) return "Please enter the employee's phone number.";
  if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) return 'Phone number must be 10 digits.';
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address.';
  if (form.aadhar_number && !/^\d{12}$/.test(form.aadhar_number.replace(/\s/g, ''))) return 'Aadhaar number must be 12 digits.';
  if (form.ifsc_code && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.ifsc_code.trim()))
    return 'Enter a valid 11-character IFSC code (e.g. SBIN0001234).';
  if (form.bank_account_number && !/^\d{6,18}$/.test(form.bank_account_number.replace(/\s/g, '')))
    return 'Enter a valid bank account number.';
  if (!form.joining_date) return 'Please enter the joining date.';
  if (form.joining_date > todayStr()) return "Joining date can't be in the future.";
  if (!form.is_active && !form.resigned_date) return 'Please enter the resigned date.';
  if (form.resigned_date && form.resigned_date < form.joining_date) return "Resigned date can't be before the joining date.";
  return null;
}

// Once an employee's resigned date has actually arrived, drop them off the
// default roster - but not before, so a resignation entered ahead of time
// (notice period) doesn't hide someone who's still working.
function isPastResignation(e) {
  return !e.is_active && e.resigned_date && e.resigned_date <= todayStr();
}

function EmployeesTab({ employees, loading, reload }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showResigned, setShowResigned] = useState(false);
  const [form, setForm] = useState(emptyEmployeeForm());

  const openAdd = () => {
    setForm(emptyEmployeeForm());
    setShowForm(true);
  };

  const openEdit = (employee) => {
    setForm({
      id: employee.id,
      full_name: employee.full_name,
      email: employee.email || '',
      phone: employee.phone || '',
      aadhar_number: employee.aadhar_number || '',
      designation: employee.designation || '',
      monthly_salary: String(employee.monthly_salary || ''),
      joining_date: employee.joining_date || '',
      is_active: employee.is_active,
      resigned_date: employee.resigned_date || '',
      upi_id: employee.upi_id || '',
      bank_account_number: employee.bank_account_number || '',
      ifsc_code: employee.ifsc_code || '',
      note: employee.note || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const error = validateEmployeeForm(form);
    if (error) {
      Alert.alert('Check the form', error);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email || null,
        phone: form.phone,
        aadhar_number: form.aadhar_number || null,
        designation: form.designation || null,
        monthly_salary: Number(form.monthly_salary),
        joining_date: form.joining_date,
        is_active: form.is_active,
        resigned_date: form.resigned_date || null,
        upi_id: form.upi_id || null,
        bank_account_number: form.bank_account_number || null,
        ifsc_code: form.ifsc_code ? form.ifsc_code.trim().toUpperCase() : null,
        note: form.note || null,
      };
      if (form.id) {
        await employeesApi.update(form.id, payload);
      } else {
        await employeesApi.create(payload);
      }
      setForm(emptyEmployeeForm());
      setShowForm(false);
      await reload();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not save employee.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (employee) => {
    Alert.alert(
      employee.full_name,
      'Are you sure you want to delete this employee? This also removes their attendance and payroll history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await employeesApi.remove(employee.id);
              await reload();
            } catch (err) {
              Alert.alert('Failed', err.message || 'Could not delete employee.');
            }
          },
        },
      ],
    );
  };

  const filtered = useMemo(
    () =>
      employees
        .filter((e) => showResigned || !isPastResignation(e))
        .filter(
          (e) =>
            !search ||
            e.full_name.toLowerCase().includes(search.toLowerCase()) ||
            (e.designation || '').toLowerCase().includes(search.toLowerCase()),
        ),
    [employees, showResigned, search],
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <>
          <Button
            title="+ Add Employee"
            onPress={openAdd}
            style={{ marginBottom: 12 }}
          />
          <SearchBar placeholder="Search employees..." value={search} onChangeText={setSearch} style={{ marginBottom: 12 }} />
          <Pressable onPress={() => setShowResigned((v) => !v)} style={styles.checkboxRow}>
            <View style={[styles.checkbox, showResigned && styles.checkboxChecked]}>
              {showResigned && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <Text style={styles.checkboxLabel}>Show Resigned</Text>
          </Pressable>
        </>
      }
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 25).duration(250)}>
          <Card style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>
                {item.designation || 'Staff'}
                {item.phone ? ` · ${item.phone}` : ''}
              </Text>
              <Text style={styles.salary}>Rs {Number(item.monthly_salary || 0).toFixed(0)}/mo</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              {!item.is_active && <Pill label="Inactive" tone="danger" />}
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
      ListEmptyComponent={!loading && <EmptyState text="No employees yet." />}
      ListFooterComponent={
        <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
          <View style={styles.modal}>
            <ScreenHeader title={form.id ? 'Edit Employee' : 'Add Employee'} />
            <ScrollView contentContainerStyle={styles.modalContent}>
              <SectionDivider>Basic Details</SectionDivider>
              <FieldLabel required>Full Name</FieldLabel>
              <Input value={form.full_name} onChangeText={(v) => setForm((f) => ({ ...f, full_name: v }))} />
              <FieldLabel>Email Address (optional)</FieldLabel>
              <Input
                autoCapitalize="none"
                keyboardType="email-address"
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              />
              <FieldLabel required>Phone Number</FieldLabel>
              <Input
                keyboardType="phone-pad"
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
              />
              <FieldLabel>Aadhaar Number (optional)</FieldLabel>
              <Input
                keyboardType="numeric"
                value={form.aadhar_number}
                onChangeText={(v) => setForm((f) => ({ ...f, aadhar_number: v }))}
              />
              <FieldLabel>Designation</FieldLabel>
              <Input value={form.designation} onChangeText={(v) => setForm((f) => ({ ...f, designation: v }))} />

              <SectionDivider>Other Details</SectionDivider>
              <FieldLabel required>Monthly Salary</FieldLabel>
              <Input
                keyboardType="numeric"
                value={form.monthly_salary}
                onChangeText={(v) => setForm((f) => ({ ...f, monthly_salary: v }))}
              />
              <FieldLabel required>Joining Date</FieldLabel>
              <DatePicker
                value={form.joining_date}
                onChange={(v) => setForm((f) => ({ ...f, joining_date: v }))}
                mode="date"
                maximumDate={new Date()}
              />

              <SectionDivider>Bank Details</SectionDivider>
              <FieldLabel>UPI ID (optional)</FieldLabel>
              <Input value={form.upi_id} onChangeText={(v) => setForm((f) => ({ ...f, upi_id: v }))} />
              <FieldLabel>Bank Account Number (optional)</FieldLabel>
              <Input
                keyboardType="numeric"
                value={form.bank_account_number}
                onChangeText={(v) => setForm((f) => ({ ...f, bank_account_number: v }))}
              />
              <FieldLabel>IFSC Code (optional)</FieldLabel>
              <Input
                placeholder="e.g. SBIN0001234"
                autoCapitalize="characters"
                value={form.ifsc_code}
                onChangeText={(v) => setForm((f) => ({ ...f, ifsc_code: v }))}
              />

              <SectionDivider>Note</SectionDivider>
              <Input placeholder="Optional note" value={form.note} onChangeText={(v) => setForm((f) => ({ ...f, note: v }))} />

              <FieldLabel>Status</FieldLabel>
              <SelectPicker
                items={[
                  { id: 'employed', label: 'Employed' },
                  { id: 'resigned', label: 'Resigned' },
                ]}
                value={form.is_active ? 'employed' : 'resigned'}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    is_active: v === 'employed',
                    resigned_date: v === 'employed' ? '' : f.resigned_date || todayStr(),
                  }))
                }
                title="Select Status"
              />
              {!form.is_active && (
                <>
                  <FieldLabel required>Resigned Date</FieldLabel>
                  <DatePicker
                    value={form.resigned_date}
                    onChange={(v) => setForm((f) => ({ ...f, resigned_date: v }))}
                    mode="date"
                  />
                </>
              )}

              <View style={styles.modalActions}>
                <Button title="Cancel" variant="outline" onPress={() => setShowForm(false)} style={{ flex: 1 }} />
                <Button title="Save Employee" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
              </View>
            </ScrollView>
          </View>
        </Modal>
      }
    />
  );
}

function SectionDivider({ children }) {
  return (
    <View style={styles.sectionDivider}>
      <Text style={styles.sectionDividerText}>{children}</Text>
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

function AttendanceTab({ employees }) {
  const [subTab, setSubTab] = useState('Mark Attendance');

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.subTabs}>
        {['Mark Attendance', 'Attendance Report'].map((t) => (
          <Button
            key={t}
            title={t}
            variant={subTab === t ? 'primary' : 'outline'}
            onPress={() => setSubTab(t)}
            style={{ flex: 1 }}
          />
        ))}
      </View>
      {subTab === 'Mark Attendance' ? (
        <MarkAttendanceTab employees={employees} />
      ) : (
        <AttendanceReportTab employees={employees} />
      )}
    </View>
  );
}

function MarkAttendanceTab({ employees }) {
  const [date, setDate] = useState(todayStr());
  const [statusByEmployee, setStatusByEmployee] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.is_active || (e.resigned_date && date <= e.resigned_date)),
    [employees, date],
  );

  const loadDay = useCallback(async () => {
    // Only fetch once the date is a complete YYYY-MM-DD - otherwise every
    // keystroke while typing fires a request with a partial string, which
    // the API rejects as an invalid date.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setLoading(true);
    try {
      const records = await attendanceApi.list({ date_: date });
      const map = {};
      records.forEach((r) => {
        map[r.employee_id] = r.status;
      });
      setStatusByEmployee(map);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const markAllPresent = () => {
    const map = {};
    activeEmployees.forEach((e) => {
      map[e.id] = 'present';
    });
    setStatusByEmployee(map);
  };

  const handleSave = async () => {
    const entries = activeEmployees
      .filter((e) => statusByEmployee[e.id])
      .map((e) => ({ employee_id: e.id, status: statusByEmployee[e.id] }));
    if (entries.length === 0) {
      Alert.alert('Nothing marked', "Mark at least one employee's status.");
      return;
    }
    setSaving(true);
    try {
      await attendanceApi.bulkMark(date, entries);
      Alert.alert('Saved', `Marked ${entries.length}/${activeEmployees.length} employees for ${date}.`);
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(
    () =>
      activeEmployees.filter(
        (e) =>
          !search ||
          e.full_name.toLowerCase().includes(search.toLowerCase()) ||
          (e.designation || '').toLowerCase().includes(search.toLowerCase()),
      ),
    [activeEmployees, search],
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <>
          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <DatePicker value={date} onChange={setDate} mode="date" maximumDate={new Date()} />
            </View>
            <Button
              title="Mark All Present"
              variant="outline"
              onPress={markAllPresent}
              disabled={activeEmployees.length === 0}
              style={{ paddingHorizontal: 14 }}
            />
          </View>
          <SearchBar
            placeholder="Search employee..."
            value={search}
            onChangeText={setSearch}
            style={{ marginTop: 12, marginBottom: 12 }}
          />
          {loading && <Text style={styles.meta}>Loading attendance for {date}...</Text>}
        </>
      }
      renderItem={({ item }) => (
        <Card style={styles.attendanceRow}>
          <Text style={styles.name}>{item.full_name}</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setStatusByEmployee((prev) => ({ ...prev, [item.id]: s.value }))}
                style={[
                  styles.statusChip,
                  statusByEmployee[item.id] === s.value && { backgroundColor: STATUS_COLORS[s.value] },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    statusByEmployee[item.id] === s.value && styles.statusChipTextActive,
                  ]}
                >
                  {STATUS_LABELS[s.value]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>
      )}
      ListFooterComponent={<Button title="Save Attendance" onPress={handleSave} loading={saving} style={{ marginTop: 8 }} />}
      ListEmptyComponent={<EmptyState text="No employees to mark." />}
    />
  );
}

function isEmployedOn(employee, dateStr) {
  if (employee.joining_date && dateStr < employee.joining_date) return false;
  if (!employee.is_active && employee.resigned_date && dateStr > employee.resigned_date) return false;
  return true;
}

function daysInMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function AttendanceReportTab({ employees }) {
  const [monthStrValue, setMonthStrValue] = useState(monthStr());
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(monthStrValue)) return;
    setLoading(true);
    try {
      const recordList = await attendanceApi.list({ month: `${monthStrValue}-01` });
      setRecords(recordList);
    } finally {
      setLoading(false);
    }
  }, [monthStrValue]);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(
    () => Array.from({ length: /^\d{4}-\d{2}$/.test(monthStrValue) ? daysInMonth(monthStrValue) : 30 }, (_, i) => i + 1),
    [monthStrValue],
  );

  const recordsByEmployee = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      const day = Number(r.date.slice(8, 10));
      map[r.employee_id] = map[r.employee_id] || {};
      map[r.employee_id][day] = r.status;
    });
    return map;
  }, [records]);

  const summaryFor = useCallback(
    (employeeId) => {
      const byStatus = recordsByEmployee[employeeId] || {};
      const counts = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, 0]));
      Object.values(byStatus).forEach((status) => {
        if (counts[status] !== undefined) counts[status] += 1;
      });
      return counts;
    },
    [recordsByEmployee],
  );

  const filteredEmployees = useMemo(
    () =>
      employees
        .filter((e) => !search || e.full_name.toLowerCase().includes(search.toLowerCase()) || (e.designation || '').toLowerCase().includes(search.toLowerCase()))
        .filter((e) => days.some((d) => isEmployedOn(e, `${monthStrValue}-${String(d).padStart(2, '0')}`))),
    [employees, search, days, monthStrValue],
  );

  const exportRows = () =>
    filteredEmployees.map((e) => {
      const byStatus = recordsByEmployee[e.id] || {};
      const summary = summaryFor(e.id);
      const dayCodes = days.map((d) => {
        const dateStr = `${monthStrValue}-${String(d).padStart(2, '0')}`;
        if (!isEmployedOn(e, dateStr)) return '';
        const meta = STATUS_OPTIONS.find((o) => o.value === byStatus[d]);
        return meta?.code || '';
      });
      return { name: e.full_name, dayCodes, summary };
    });

  const handleDownloadCsv = async () => {
    const rows = exportRows();
    if (rows.length === 0) {
      Alert.alert('Nothing to export', 'No employees to export for this month.');
      return;
    }
    try {
      const headers = ['Name', ...days.map(String), ...STATUS_OPTIONS.map((o) => STATUS_LABELS[o.value])];
      const csv = rowsToCsv([
        headers,
        ...rows.map((r) => [r.name, ...r.dayCodes, ...STATUS_OPTIONS.map((o) => r.summary[o.value] || 0)]),
      ]);
      await exportCsv(`attendance-${monthStrValue}.csv`, csv);
    } catch (err) {
      Alert.alert('Export failed', err.message);
    }
  };

  const escapeHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const handleDownloadPdf = async () => {
    const rows = exportRows();
    if (rows.length === 0) {
      Alert.alert('Nothing to export', 'No employees to export for this month.');
      return;
    }
    try {
      const headerCells = ['Name', ...days.map(String), ...STATUS_OPTIONS.map((o) => o.code)]
        .map((h) => `<th>${escapeHtml(h)}</th>`)
        .join('');
      const bodyRows = rows
        .map(
          (r) =>
            `<tr><td class="name">${escapeHtml(r.name)}</td>` +
            r.dayCodes.map((c) => `<td>${escapeHtml(c)}</td>`).join('') +
            STATUS_OPTIONS.map((o) => `<td>${escapeHtml(r.summary[o.value] || 0)}</td>`).join('') +
            `</tr>`,
        )
        .join('');
      const html = `<html><head><meta charset="utf-8" /><style>
        body{font-family:Arial,Helvetica,sans-serif;padding:12px;}
        h1{font-size:16px;margin:0 0 4px;}
        p{font-size:10px;margin:0 0 10px;color:#555;}
        table{border-collapse:collapse;width:100%;}
        th,td{border:1px solid #ccc;padding:2px 4px;font-size:7px;text-align:center;white-space:nowrap;}
        th{background:#f4f4f4;}
        td.name{text-align:left;font-weight:bold;}
      </style></head><body>
        <h1>Attendance Report</h1>
        <p>Month: ${escapeHtml(monthStrValue)}</p>
        <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
      </body></html>`;
      await exportPdf(`attendance-${monthStrValue}.pdf`, html);
    } catch (err) {
      Alert.alert('Export failed', err.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ marginBottom: 12 }}>
        <DatePicker value={monthStrValue} onChange={setMonthStrValue} mode="month" maximumDate={new Date()} />
      </View>
      <SearchBar placeholder="Search employee..." value={search} onChangeText={setSearch} style={{ marginBottom: 12 }} />
      <View style={[styles.legendRow, { marginBottom: 12 }]}>
        <Button title="Download CSV" variant="outline" onPress={handleDownloadCsv} disabled={loading} style={{ flex: 1 }} />
        <Button title="Download PDF" variant="outline" onPress={handleDownloadPdf} disabled={loading} style={{ flex: 1 }} />
      </View>
      <View style={styles.legendRow}>
        {STATUS_OPTIONS.map((o) => (
          <View key={o.value} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLORS[o.value] }]} />
            <Text style={styles.legendLabel}>
              {o.code} = {o.value.replace('_', ' ')}
            </Text>
          </View>
        ))}
      </View>
      {loading && <Text style={styles.meta}>Loading attendance report...</Text>}

      {!loading && filteredEmployees.length === 0 ? (
        <EmptyState text="No employees on the roster for this month." />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={styles.gridRow}>
              <Text style={[styles.gridHeaderCell, { width: COL_NAME }]}>Name</Text>
              {days.map((d) => (
                <Text key={d} style={[styles.gridHeaderCell, styles.gridDayCell]}>
                  {d}
                </Text>
              ))}
              {STATUS_OPTIONS.map((o) => (
                <Text key={o.value} style={[styles.gridHeaderCell, styles.gridSummaryCell]}>
                  {o.code}
                </Text>
              ))}
            </View>

            {filteredEmployees.map((e) => {
              const byStatus = recordsByEmployee[e.id] || {};
              const summary = summaryFor(e.id);
              return (
                <View key={e.id} style={styles.gridRow}>
                  <Text style={[styles.gridCell, styles.gridNameCell, { width: COL_NAME }]} numberOfLines={1}>
                    {e.full_name}
                  </Text>
                  {days.map((d) => {
                    const dateStr = `${monthStrValue}-${String(d).padStart(2, '0')}`;
                    if (!isEmployedOn(e, dateStr)) {
                      return <View key={d} style={[styles.gridDayCell, styles.gridDayCellBlank]} />;
                    }
                    const status = byStatus[d];
                    const meta = STATUS_OPTIONS.find((o) => o.value === status);
                    return (
                      <View
                        key={d}
                        style={[
                          styles.gridDayCell,
                          styles.gridDayCellBox,
                          meta && { backgroundColor: STATUS_COLORS[meta.value] + '26' },
                        ]}
                      >
                        {meta && <Text style={[styles.gridDayText, { color: STATUS_COLORS[meta.value] }]}>{meta.code}</Text>}
                      </View>
                    );
                  })}
                  {STATUS_OPTIONS.map((o) => (
                    <Text key={o.value} style={[styles.gridCell, styles.gridSummaryCell]}>
                      {summary[o.value] || 0}
                    </Text>
                  ))}
                </View>
              );
            })}
            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      )}
    </ScrollView>
  );
}

// Matches web's Workforce/Payroll/payments.js exportPayslipPdf.
function buildPayslipHtml(entry, employee) {
  const rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
  const rows = [
    ['Salary Amount', rs(entry.gross_salary)],
    [
      'Attendance Deduction',
      `${rs(entry.attendance_deduction)} (${entry.absent_days} absent, ${entry.half_days} half day)`,
    ],
    ['Advance Deduction', rs(entry.advance_deduction)],
    ['Other Deduction', rs(entry.other_deduction)],
    ['Net Salary', rs(entry.net_salary)],
    ['Amount Paid', rs(entry.amount_paid)],
    ['Payment Status', entry.is_paid ? 'Paid' : 'Unpaid'],
  ];
  return `
    <html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;padding:24px;">
      <h2 style="margin:0 0 4px;">Payslip</h2>
      <div style="font-size:12px;color:#444;margin-bottom:2px;">Employee: ${employee?.full_name || '-'}</div>
      <div style="font-size:12px;color:#444;margin-bottom:2px;">Designation: ${employee?.designation || '-'}</div>
      <div style="font-size:12px;color:#444;margin-bottom:16px;">Period: ${String(entry.period).slice(0, 7)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>
          <th style="text-align:left;border-bottom:2px solid #111;padding:6px 4px;">Description</th>
          <th style="text-align:left;border-bottom:2px solid #111;padding:6px 4px;">Value</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              ([label, value]) =>
                `<tr><td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;">${label}</td><td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;">${value}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </body></html>`;
}

function PayrollTab({ employees }) {
  const [period, setPeriod] = useState(monthStr());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const employeeMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const load = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(period)) return;
    setLoading(true);
    try {
      const data = await payrollApi.list({ period: `${period}-01` });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await payrollApi.defaultForMonth(`${period}-01`);
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not generate payroll.');
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkPaid = async (id) => {
    try {
      await payrollApi.markPaid(id, { amount_paid: rows.find((r) => r.id === id)?.net_salary || 0 });
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not mark as paid.');
    }
  };

  const handleDownloadPayslip = async (item) => {
    try {
      const employee = employeeMap[item.employee_id];
      const html = buildPayslipHtml(item, employee);
      await exportPdf(`payslip-${employee?.full_name || item.employee_id}-${String(item.period).slice(0, 7)}.pdf`, html);
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not generate payslip.');
    }
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.periodRow}>
          <View style={{ flex: 1 }}>
            <DatePicker value={period} onChange={setPeriod} mode="month" />
          </View>
          <Button title="Add Default Entries" onPress={handleGenerate} loading={generating} style={{ paddingHorizontal: 16 }} />
        </View>
      }
      renderItem={({ item, index }) => {
        const employee = employeeMap[item.employee_id];
        const netSalary = Number(item.net_salary || 0);
        const isPaid = Number(item.amount_paid || 0) >= netSalary && netSalary > 0;
        return (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 25).duration(250)}>
            <Card style={styles.payrollRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{employee?.full_name || `Employee #${item.employee_id}`}</Text>
                <Text style={styles.meta}>
                  Present {item.present_days} · Absent {item.absent_days} · Net Rs {netSalary.toFixed(0)}
                </Text>
              </View>
              <View style={styles.payrollActions}>
                {isPaid ? (
                  <Pill label="Paid" tone="success" />
                ) : (
                  <Button title="Mark Paid" variant="outline" onPress={() => handleMarkPaid(item.id)} style={styles.markPaidBtn} />
                )}
                <Pressable
                  onPress={() => handleDownloadPayslip(item)}
                  hitSlop={8}
                  style={styles.payslipBtn}
                  accessibilityLabel="Download Payslip"
                >
                  <Ionicons name="download-outline" size={18} color={colors.pillText} />
                </Pressable>
              </View>
            </Card>
          </Animated.View>
        );
      }}
      ListEmptyComponent={!loading && <EmptyState text={`No payroll generated for ${period} yet.`} />}
    />
  );
}

const emptyAdvanceEditForm = () => ({ id: null, employeeId: null, date: '', amount: '', paymentMode: 'Cash', note: '' });

function AdvancesTab({ employees }) {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const [editingAdvance, setEditingAdvance] = useState(null);
  const [editForm, setEditForm] = useState(emptyAdvanceEditForm());
  const [savingEdit, setSavingEdit] = useState(false);

  // Matches web's advances-panel.js: both edit and delete are gated behind
  // any admin's password (SweetAlertService.promptAdminPassword), regardless
  // of which role is actually logged in and performing the action.
  const [pendingAction, setPendingAction] = useState(null); // { advance, type: 'edit' | 'delete' }

  const employeeMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const load = useCallback(async () => {
    try {
      const data = await salaryAdvancesApi.list();
      setAdvances(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const amt = Number(amount);
    if (!employeeId || !amt || amt <= 0) {
      Alert.alert('Invalid', 'Select an employee and a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await salaryAdvancesApi.create({
        employee_id: employeeId,
        amount: amt,
        date: todayStr(),
        note: note || null,
      });
      setEmployeeId(null);
      setAmount('');
      setNote('');
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not save advance.');
    } finally {
      setSaving(false);
    }
  };

  // An advance already settled in payroll can no longer be edited or
  // deleted - matches the API (salary_advances.py update_salary_advance /
  // delete_salary_advance both reject when advance.is_settled) and web's
  // advances-panel.js, which only renders the pencil/trash icons when
  // !a.is_settled.
  const openEdit = (advance) => setPendingAction({ advance, type: 'edit' });

  const beginEdit = (advance) => {
    setEditingAdvance(advance);
    setEditForm({
      id: advance.id,
      employeeId: advance.employee_id,
      date: advance.date,
      amount: String(advance.amount),
      paymentMode: advance.payment_mode || 'Cash',
      note: advance.note || '',
    });
  };

  const closeEdit = () => {
    setEditingAdvance(null);
    setEditForm(emptyAdvanceEditForm());
  };

  const handleSaveEdit = async () => {
    const amt = Number(editForm.amount);
    if (!amt || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }
    const employee = employeeMap[editForm.employeeId];
    if (employee && amt > Number(employee.monthly_salary || 0)) {
      Alert.alert(
        'Amount too high',
        `Advance amount can't exceed ${employee.full_name}'s monthly salary (Rs. ${Number(employee.monthly_salary || 0).toLocaleString()}).`,
      );
      return;
    }
    setSavingEdit(true);
    try {
      await salaryAdvancesApi.update(editForm.id, {
        date: editForm.date,
        amount: amt,
        payment_mode: editForm.paymentMode,
        note: editForm.note || null,
      });
      closeEdit();
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not update advance.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = (advance) => {
    Alert.alert(
      'Delete advance',
      `Remove the Rs. ${Number(advance.amount || 0).toFixed(0)} advance for ${employeeMap[advance.employee_id]?.full_name || 'this employee'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => setPendingAction({ advance, type: 'delete' }),
        },
      ],
    );
  };

  const cancelPendingAction = () => setPendingAction(null);

  const confirmPendingAction = async (password) => {
    await authApi.verifyAdminPassword(password);
    const { advance, type } = pendingAction;
    setPendingAction(null);
    if (type === 'edit') {
      beginEdit(advance);
      return;
    }
    try {
      await salaryAdvancesApi.remove(advance.id);
      await load();
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not delete advance.');
    }
  };

  // Matches web's Workforce/Payroll/advances-panel.js exportRows - web
  // scopes this to a date-range filter the mobile Advances tab doesn't
  // have, so this exports every currently-loaded advance instead.
  const exportRows = () =>
    advances.map((a) => [
      a.date,
      employeeMap[a.employee_id]?.full_name || `Employee #${a.employee_id}`,
      a.amount,
      a.payment_mode || 'Cash',
      a.is_settled ? 'Settled' : 'Pending',
      a.note || '',
    ]);

  const handleDownloadCsv = async () => {
    const rows = exportRows();
    if (rows.length === 0) {
      Alert.alert('Nothing to export', 'No advances to export.');
      return;
    }
    try {
      const csv = rowsToCsv([['Date', 'Employee', 'Amount', 'Payment Mode', 'Status', 'Note'], ...rows]);
      await exportCsv(`salary-advances-${todayStr()}.csv`, csv);
    } catch (err) {
      Alert.alert('Export failed', err.message);
    }
  };

  const handleDownloadPdf = async () => {
    const rows = exportRows();
    if (rows.length === 0) {
      Alert.alert('Nothing to export', 'No advances to export.');
      return;
    }
    try {
      const html = `
        <html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;padding:24px;">
          <h2 style="margin:0 0 4px;">Salary Advances</h2>
          <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:12px;">
            <thead><tr>
              ${['Date', 'Employee', 'Amount', 'Payment Mode', 'Status', 'Note']
                .map((h) => `<th style="text-align:left;border-bottom:2px solid #111;padding:6px 4px;">${h}</th>`)
                .join('')}
            </tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) =>
                    `<tr>${r
                      .map(
                        (c, i) =>
                          `<td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;">${i === 2 ? `Rs. ${Number(c).toLocaleString()}` : c || '-'}</td>`,
                      )
                      .join('')}</tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </body></html>`;
      await exportPdf(`salary-advances-${todayStr()}.pdf`, html);
    } catch (err) {
      Alert.alert('Export failed', err.message);
    }
  };

  return (
    <FlatList
      data={advances}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <>
          <Card style={styles.form}>
            <Text style={styles.formTitle}>Add Advance</Text>
            <SelectPicker
              items={employees.map((e) => ({ id: e.id, label: e.full_name }))}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Select employee"
              title="Select Employee"
            />
            <Input placeholder="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <Input placeholder="Note (optional)" value={note} onChangeText={setNote} />
            <Button title="Save Advance" onPress={handleAdd} loading={saving} />
          </Card>
          <View style={styles.exportRow}>
            <Pressable onPress={handleDownloadCsv} style={styles.exportBtn}>
              <Ionicons name="document-text-outline" size={16} color="#fff" />
              <Text style={styles.exportBtnText}>CSV</Text>
            </Pressable>
            <Pressable onPress={handleDownloadPdf} style={styles.exportBtn}>
              <Ionicons name="document-outline" size={16} color="#fff" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </Pressable>
          </View>
        </>
      }
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 25).duration(250)}>
          <Card style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{employeeMap[item.employee_id]?.full_name || `Employee #${item.employee_id}`}</Text>
              <Text style={styles.meta}>
                {item.date}
                {item.note ? ` · ${item.note}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={styles.salary}>Rs {Number(item.amount || 0).toFixed(0)}</Text>
              {item.is_settled ? (
                <Pill label="Settled" tone="default" />
              ) : (
                <View style={styles.actionRow}>
                  <Pressable onPress={() => openEdit(item)}>
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(item)}>
                    <Text style={styles.removeText}>Delete</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </Card>
        </Animated.View>
      )}
      ListEmptyComponent={!loading && <EmptyState text="No salary advances yet." />}
      ListFooterComponent={
        <>
        <Modal visible={!!editingAdvance} animationType="slide" onRequestClose={closeEdit}>
          <View style={styles.modal}>
            <ScreenHeader title="Edit Advance" />
            <ScrollView contentContainerStyle={styles.modalContent}>
              <FieldLabel>Employee</FieldLabel>
              <Input value={editingAdvance ? employeeMap[editingAdvance.employee_id]?.full_name || '-' : ''} editable={false} />
              <FieldLabel required>Date</FieldLabel>
              <DatePicker
                value={editForm.date}
                onChange={(v) => setEditForm((f) => ({ ...f, date: v }))}
                mode="date"
                maximumDate={new Date()}
              />
              <FieldLabel required>Amount</FieldLabel>
              <Input
                keyboardType="numeric"
                value={editForm.amount}
                onChangeText={(v) => setEditForm((f) => ({ ...f, amount: v }))}
              />
              <FieldLabel>Payment Mode</FieldLabel>
              <SelectPicker
                items={[
                  { id: 'Cash', label: 'Cash' },
                  { id: 'Bank', label: 'Bank' },
                ]}
                value={editForm.paymentMode}
                onChange={(v) => setEditForm((f) => ({ ...f, paymentMode: v }))}
                title="Payment Mode"
              />
              <FieldLabel>Note</FieldLabel>
              <Input placeholder="Optional note" value={editForm.note} onChangeText={(v) => setEditForm((f) => ({ ...f, note: v }))} />

              <View style={styles.modalActions}>
                <Button title="Cancel" variant="outline" onPress={closeEdit} style={{ flex: 1 }} />
                <Button title="Save Changes" onPress={handleSaveEdit} loading={savingEdit} style={{ flex: 1 }} />
              </View>
            </ScrollView>
          </View>
        </Modal>

        <AdminPasswordModal
          visible={!!pendingAction}
          onCancel={cancelPendingAction}
          onConfirm={confirmPendingAction}
          message={
            pendingAction?.type === 'edit'
              ? "Enter an admin's password to edit this advance."
              : "Enter an admin's password to confirm this action."
          }
        />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 12, marginBottom: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.pill },
  tabActive: { backgroundColor: colors.ink },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.pillText },
  tabTextActive: { color: '#fff' },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40, gap: 10 },
  form: { gap: 10, marginBottom: 12 },
  formTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalContent: { padding: 16, paddingTop: 12, gap: 10, paddingBottom: 40 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  sectionDivider: { marginTop: 6, marginBottom: 2 },
  sectionDividerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowInputs: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  salary: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 12 },
  editText: { fontSize: 12, color: colors.ink, fontWeight: '600' },
  removeText: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  attendanceRow: { padding: 14, gap: 10, marginBottom: 10 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipText: { fontSize: 12, fontWeight: '700', color: colors.pillText },
  statusChipTextActive: { color: '#fff' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.ink, borderColor: colors.ink },
  checkboxLabel: { fontSize: 13, color: colors.pillText, fontWeight: '500' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.pillText, marginTop: 6 },
  requiredMark: { color: colors.danger },
  subTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  summaryChip: { alignItems: 'center', minWidth: 32 },
  summaryChipCode: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  summaryChipCount: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  gridHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: colors.pill,
    textAlign: 'center',
  },
  gridCell: {
    fontSize: 12,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  gridNameCell: { textAlign: 'left', fontWeight: '600' },
  gridDayCell: { width: COL_DAY, alignItems: 'center', justifyContent: 'center' },
  gridDayCellBlank: { backgroundColor: colors.pill },
  gridDayCellBox: { paddingVertical: 8 },
  gridDayText: { fontSize: 11, fontWeight: '700' },
  gridSummaryCell: { width: COL_SUMMARY },
  periodRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  payrollRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  markPaidBtn: { height: 34, paddingHorizontal: 12 },
  payrollActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  exportBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  payslipBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
