import React, { useState, useCallback } from 'react';
import {
  View, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MealPlanEntry, MealSlot, MealStatus } from '../types';
import { ApiService } from '../services/ApiService';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from '../components';

// ── Typen ──────────────────────────────────────────────────────────────────
interface ReserveEntry {
  id: string;
  title: string;
  notes?: string;
}

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
};

const SLOT_ICONS: Record<MealSlot, any> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
};

/**
 * Die Wochentagsfarben sind entfallen: sieben Regenbogentoene haben eine
 * rein dekorative Dimension farbig kodiert und dabei mit Status und Auswahl
 * konkurriert -- also mit genau den Dimensionen, auf die es ankommt. Heutiger
 * Tag traegt jetzt den Akzent, alle anderen sind neutral.
 */

const STATUS_LABELS: Partial<Record<MealStatus, string>> = {
  planned: 'Geplant',
  wish: 'Wunsch',
};

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const ENTRY_STATUSES: MealStatus[] = ['planned', 'wish'];

// ── Hilfsfunktionen ────────────────────────────────────────────────────────
function getWeekDays(baseDate: Date): Date[] {
  const monday = new Date(baseDate);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getCalendarCells(base: Date): (Date | null)[] {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(base.getFullYear(), base.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ── Komponente ─────────────────────────────────────────────────────────────
export default function MealPlanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Die frueheren Modulkonstanten, jetzt ans Theme gebunden. Dadurch bleiben
  // die Aufrufstellen im JSX unveraendert und werden trotzdem dark-mode-fest.
  const PRIMARY = colors.accent;
  const TEXT = colors.text;
  const TEXT_MUTED = colors.textMuted;
  const RESERVE_COLOR = colors.warning;
  const DELETE_COLOR = colors.danger;
  const STATUS_COLORS: Partial<Record<MealStatus, string>> = {
    planned: colors.success,
    wish: colors.accent,
  };
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [weekBase, setWeekBase] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [reserveList, setReserveList] = useState<ReserveEntry[]>([]);

  // Modal: Eintrag
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formSlot, setFormSlot] = useState<MealSlot>('lunch');
  const [formTitle, setFormTitle] = useState('');
  const [formStatus, setFormStatus] = useState<MealStatus>('planned');
  const [formNotes, setFormNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Modal: Reserve verwalten
  const [reserveManageVisible, setReserveManageVisible] = useState(false);
  const [newReserveTitle, setNewReserveTitle] = useState('');
  const [newReserveNotes, setNewReserveNotes] = useState('');

  // Modal: Aus Reserve auswählen
  const [pickReserveVisible, setPickReserveVisible] = useState(false);
  const [pickContext, setPickContext] = useState<{ date: string; slot: MealSlot } | null>(null);

  // Modal: Mehrere Slots auf einmal
  const [multiModalVisible, setMultiModalVisible] = useState(false);
  const [multiTitle, setMultiTitle] = useState('');
  const [multiStatus, setMultiStatus] = useState<MealStatus>('planned');
  const [multiNotes, setMultiNotes] = useState('');
  const [multiSelections, setMultiSelections] = useState<Set<string>>(new Set());
  const [multiReservePickVisible, setMultiReservePickVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());
  const [deleteConfirmEntryId, setDeleteConfirmEntryId] = useState<string | null>(null);

  const days = getWeekDays(weekBase);
  const weekFrom = toISO(days[0]);
  const weekTo = toISO(days[6]);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
      loadReserveList();
    }, [weekFrom, weekTo])
  );

  async function loadEntries() {
    setLoading(true);
    try {
      const serverData = await ApiService.fetchMealPlan(weekFrom, weekTo);
      if (serverData && serverData.length >= 0) {
        setEntries(serverData);
        await AsyncStorage.setItem('@mealplan', JSON.stringify(serverData));
      } else {
        const local = await AsyncStorage.getItem('@mealplan');
        if (local) setEntries(JSON.parse(local));
      }
    } catch {
      const local = await AsyncStorage.getItem('@mealplan');
      if (local) setEntries(JSON.parse(local));
    } finally {
      setLoading(false);
    }
  }

  async function loadReserveList() {
    try {
      const serverData = await ApiService.fetchMealReserve();
      setReserveList(serverData);
      await AsyncStorage.setItem('@meal_reserve', JSON.stringify(serverData));
    } catch {
      const local = await AsyncStorage.getItem('@meal_reserve');
      if (local) setReserveList(JSON.parse(local));
    }
  }

  async function addReserveEntry() {
    if (!newReserveTitle.trim()) return;
    const created = await ApiService.createMealReserveEntry(
      newReserveTitle.trim(),
      newReserveNotes.trim() || undefined
    );
    if (created) {
      const updated = [...reserveList, created];
      setReserveList(updated);
      await AsyncStorage.setItem('@meal_reserve', JSON.stringify(updated));
    }
    setNewReserveTitle('');
    setNewReserveNotes('');
  }

  async function deleteReserveEntry(id: string) {
    await ApiService.deleteMealReserveEntry(id);
    const updated = reserveList.filter(r => r.id !== id);
    setReserveList(updated);
    await AsyncStorage.setItem('@meal_reserve', JSON.stringify(updated));
  }

  function openPickReserve(date: string, slot: MealSlot) {
    if (reserveList.length === 0) {
      Alert.alert('Reserve leer', 'Füge zuerst Gerichte zur Reserve hinzu (oben auf "Reserve" tippen).');
      return;
    }
    setPickContext({ date, slot });
    setPickReserveVisible(true);
  }

  async function insertFromReserve(reserve: ReserveEntry) {
    if (!pickContext) return;
    try {
      await ApiService.createMealPlanEntry({
        date: pickContext.date,
        slot: pickContext.slot,
        title: reserve.title,
        status: 'planned',
        notes: reserve.notes,
      });
      setPickReserveVisible(false);
      setPickContext(null);
      await loadEntries();
    } catch {
      Alert.alert('Fehler', 'Eintrag konnte nicht erstellt werden.');
    }
  }

  function openNewEntry(date: string, slot: MealSlot) {
    setFormDate(date);
    setFormSlot(slot);
    setFormTitle('');
    setFormStatus('planned');
    setFormNotes('');
    setEditingId(null);
    setEntryModalVisible(true);
  }

  function openEditEntry(entry: MealPlanEntry) {
    setFormDate(entry.date);
    setFormSlot(entry.slot);
    setFormTitle(entry.title);
    setFormStatus(entry.status === 'reserve' ? 'planned' : entry.status);
    setFormNotes(entry.notes || '');
    setEditingId(entry.id);
    setEntryModalVisible(true);
  }

  async function saveEntry() {
    if (!formTitle.trim()) {
      Alert.alert('Fehler', 'Bitte einen Namen eingeben.');
      return;
    }
    try {
      if (editingId) {
        await ApiService.updateMealPlanEntry(editingId, {
          title: formTitle.trim(),
          slot: formSlot,
          date: formDate,
          status: formStatus,
          notes: formNotes.trim() || undefined,
        });
      } else {
        await ApiService.createMealPlanEntry({
          date: formDate,
          slot: formSlot,
          title: formTitle.trim(),
          status: formStatus,
          notes: formNotes.trim() || undefined,
        });
      }
      setEntryModalVisible(false);
      await loadEntries();
    } catch {
      Alert.alert('Fehler', 'Eintrag konnte nicht gespeichert werden.');
    }
  }

  async function deleteEntry(id: string) {
    setDeleteConfirmEntryId(id);
  }

  function entriesForDaySlot(date: string, slot: MealSlot): MealPlanEntry[] {
    return entries.filter(e => e.date === date && e.slot === slot);
  }

  function toggleMultiSelection(date: string, slot: MealSlot) {
    const key = `${date}:${slot}`;
    setMultiSelections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openMultiEntry() {
    setMultiTitle('');
    setMultiStatus('planned');
    setMultiNotes('');
    setMultiSelections(new Set());
    setMultiModalVisible(true);
  }

  async function saveMultiEntry() {
    if (!multiTitle.trim()) {
      Alert.alert('Fehler', 'Bitte einen Namen eingeben.');
      return;
    }
    if (multiSelections.size === 0) {
      Alert.alert('Fehler', 'Bitte mindestens einen Tag & eine Mahlzeit auswählen.');
      return;
    }
    try {
      const promises = Array.from(multiSelections).map(key => {
        const [date, slot] = key.split(':') as [string, MealSlot];
        return ApiService.createMealPlanEntry({
          date,
          slot,
          title: multiTitle.trim(),
          status: multiStatus,
          notes: multiNotes.trim() || undefined,
        });
      });
      await Promise.all(promises);
      setMultiModalVisible(false);
      await loadEntries();
    } catch {
      Alert.alert('Fehler', 'Einträge konnten nicht gespeichert werden.');
    }
  }

  const todayISO = toISO(new Date());

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setCalMonth(new Date(weekBase)); setCalendarVisible(true); }}>
          <View style={styles.headerDateBtn}>
            <Ionicons name="calendar-outline" size={13} color={PRIMARY} style={{ marginRight: 5 }} />
            <Text style={styles.headerTitle}>
              {days[0].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} –{' '}
              {days[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Reserve-Leiste */}
      <TouchableOpacity style={[styles.reserveBar, { backgroundColor: colors.surface }]} onPress={() => setReserveManageVisible(true)} activeOpacity={0.75}>
        <View style={styles.reserveBarLeft}>
          <Ionicons name="archive-outline" size={15} color={RESERVE_COLOR} />
          <Text style={styles.reserveBarText}>Reserve</Text>
          {reserveList.length > 0 && (
            <View style={styles.reserveBadge}>
              <Text style={styles.reserveBadgeText}>{reserveList.length}</Text>
            </View>
          )}
        </View>
        <Text style={styles.reserveBarHint}>Verwalten</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator color={PRIMARY} style={{ marginVertical: 6 }} />}

      {/* Wochentage */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 80, paddingTop: 8 }}
      >
        {days.map(day => {
          const iso = toISO(day);
          const isToday = iso === todayISO;
          return (
            <View key={iso} style={[styles.dayCard, { backgroundColor: colors.surface }, isToday && styles.todayCard]}>
              <Text style={[styles.dayLabel, isToday && styles.todayLabel]}>
                {formatDay(day)}{isToday ? ' · Heute' : ''}
              </Text>
              {SLOTS.map(slot => {
                const slotEntries = entriesForDaySlot(iso, slot);
                return (
                  <View key={slot} style={styles.slotRow}>
                    <View style={styles.slotHeader}>
                      <Ionicons name={SLOT_ICONS[slot]} size={13} color={TEXT_MUTED} style={{ marginRight: 4 }} />
                      <Text style={styles.slotLabel}>{SLOT_LABELS[slot]}</Text>
                      <TouchableOpacity
                        onPress={() => openPickReserve(iso, slot)}
                        style={styles.slotBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="archive-outline" size={14} color={RESERVE_COLOR} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => openNewEntry(iso, slot)}
                        style={styles.slotBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="add" size={18} color={PRIMARY} />
                      </TouchableOpacity>
                    </View>
                    {slotEntries.map(entry => (
                      <TouchableOpacity
                        key={entry.id}
                        style={[styles.entryChip, { borderLeftColor: STATUS_COLORS[entry.status] ?? RESERVE_COLOR }]}
                        onPress={() => openEditEntry(entry)}
                        onLongPress={() => deleteEntry(entry.id)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.entryChipRow}>
                          <Text style={styles.entryTitle} numberOfLines={1}>{entry.title}</Text>
                          <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[entry.status] ?? RESERVE_COLOR) + '18' }]}>
                            <Text style={[styles.statusPillText, { color: STATUS_COLORS[entry.status] ?? RESERVE_COLOR }]}>
                              {STATUS_LABELS[entry.status] ?? 'Reserve'}
                            </Text>
                          </View>
                        </View>
                        {entry.notes ? <Text style={styles.entryNotes} numberOfLines={1}>{entry.notes}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {/* FAB: Gericht für mehrere Tage */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 20 }]}
        onPress={openMultiEntry}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.onAccent} />
      </TouchableOpacity>

      {/* ── Modal: Woche wählen ── */}
      <Modal visible={calendarVisible} animationType="fade" transparent onRequestClose={() => setCalendarVisible(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setCalendarVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />

            {/* Monat-Navigation */}
            <View style={styles.calMonthRow}>
              <TouchableOpacity
                onPress={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.calMonthTitle, { color: colors.text }]}>
                {calMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                onPress={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Wochentag-Labels */}
            <View style={styles.calWeekRow}>
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(wl => (
                <Text key={wl} style={[styles.calWeekLabel, { color: colors.textMuted }]}>{wl}</Text>
              ))}
            </View>

            {/* Kalender-Grid */}
            {(() => {
              const cells = getCalendarCells(calMonth);
              const rows: (Date | null)[][] = [];
              for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
              const selMonISO = toISO(getWeekDays(weekBase)[0]);
              const selSunISO = toISO(getWeekDays(weekBase)[6]);
              return rows.map((row, ri) => {
                const rowSelected = row.some(c => c && toISO(c) >= selMonISO && toISO(c) <= selSunISO);
                return (
                  <View key={ri} style={[styles.calRow, rowSelected && styles.calRowSelected]}>
                    {row.map((cell, ci) => {
                      const isTodayCell = !!cell && toISO(cell) === todayISO;
                      const inMonth = !!cell && cell.getMonth() === calMonth.getMonth();
                      const inSelWeek = !!cell && toISO(cell) >= selMonISO && toISO(cell) <= selSunISO;
                      return (
                        <TouchableOpacity
                          key={ci}
                          style={styles.calCell}
                          onPress={() => {
                            if (!cell) return;
                            setWeekBase(new Date(cell));
                            setCalendarVisible(false);
                          }}
                          activeOpacity={cell ? 0.6 : 1}
                        >
                          {cell ? (
                            <View style={[styles.calDayInner, isTodayCell && styles.calDayTodayBg]}>
                              <Text style={[
                                styles.calDayText,
                                { color: inMonth ? colors.text : colors.textMuted },
                                isTodayCell && styles.calDayTodayText,
                                inSelWeek && inMonth && !isTodayCell && { color: PRIMARY, fontWeight: '700' },
                              ]}>
                                {cell.getDate()}
                              </Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              });
            })()}

            {/* Aktuelle Woche */}
            <TouchableOpacity
              style={styles.calTodayBtn}
              onPress={() => { setWeekBase(new Date()); setCalendarVisible(false); }}
            >
              <Ionicons name="today-outline" size={14} color={PRIMARY} style={{ marginRight: 6 }} />
              <Text style={styles.calTodayBtnText}>Aktuelle Woche</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Neuer / Bearbeiten ── */}
      <Modal visible={entryModalVisible} animationType="slide" transparent onRequestClose={() => setEntryModalVisible(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior="padding" keyboardVerticalOffset={0}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEntryModalVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{editingId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</Text>

            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={formTitle}
              onChangeText={setFormTitle}
              placeholder="Gericht eingeben..."
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <Text style={styles.fieldLabel}>Mahlzeit</Text>
            <View style={styles.segmentRow}>
              {SLOTS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.segment, formSlot === s && styles.segmentActive]}
                  onPress={() => setFormSlot(s)}
                >
                  <Text style={[styles.segmentText, formSlot === s && styles.segmentTextActive]}>
                    {SLOT_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.segmentRow}>
              {ENTRY_STATUSES.map(st => (
                <TouchableOpacity
                  key={st}
                  style={[styles.segment, formStatus === st && {
                    borderColor: STATUS_COLORS[st] ?? PRIMARY,
                    backgroundColor: (STATUS_COLORS[st] ?? PRIMARY) + '18',
                  }]}
                  onPress={() => setFormStatus(st)}
                >
                  <Text style={[styles.segmentText, formStatus === st && { color: STATUS_COLORS[st] ?? PRIMARY }]}>
                    {STATUS_LABELS[st]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Notizen (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 56, textAlignVertical: 'top' }]}
              value={formNotes}
              onChangeText={setFormNotes}
              placeholder="Zutaten, Hinweise..."
              placeholderTextColor={TEXT_MUTED}
              multiline
            />

            <View style={styles.modalActions}>
              {editingId && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => { setEntryModalVisible(false); deleteEntry(editingId!); }}
                >
                  <Ionicons name="trash-outline" size={18} color={DELETE_COLOR} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.saveBtn} onPress={saveEntry}>
                <Text style={styles.saveBtnText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: Reserve verwalten ── */}
      <Modal visible={reserveManageVisible} animationType="slide" transparent onRequestClose={() => setReserveManageVisible(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setReserveManageVisible(false)} />
          <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + 16, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Ionicons name="archive-outline" size={18} color={RESERVE_COLOR} style={{ marginRight: 6 }} />
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Reserve-Liste</Text>
            </View>

            <View style={styles.reserveAddRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={newReserveTitle}
                onChangeText={setNewReserveTitle}
                placeholder="Gericht hinzufügen..."
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={addReserveEntry}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addReserveBtn, !newReserveTitle.trim() && { opacity: 0.4 }]}
                onPress={addReserveEntry}
                disabled={!newReserveTitle.trim()}
              >
                <Ionicons name="add" size={20} color={colors.onAccent} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {reserveList.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="archive-outline" size={40} color={TEXT_MUTED} style={{ marginBottom: 8 }} />
                  <Text style={styles.emptyText}>Noch keine Gerichte gespeichert</Text>
                </View>
              ) : reserveList.map(r => (
                <View key={r.id} style={styles.reserveItem}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.reserveItemTitle}>{r.title}</Text>
                    {r.notes ? <Text style={styles.reserveItemNotes}>{r.notes}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => deleteReserveEntry(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={17} color={TEXT_MUTED} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Aus Reserve auswählen ── */}
      <Modal visible={pickReserveVisible} animationType="slide" transparent onRequestClose={() => setPickReserveVisible(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPickReserveVisible(false)} />
          <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Ionicons name="archive-outline" size={18} color={RESERVE_COLOR} style={{ marginRight: 6 }} />
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Aus Reserve wählen</Text>
              {pickContext && (
                <Text style={styles.pickSlotLabel}>{SLOT_LABELS[pickContext.slot]}</Text>
              )}
            </View>
            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {reserveList.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.pickItem}
                  onPress={() => insertFromReserve(r)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.reserveItemTitle}>{r.title}</Text>
                    {r.notes ? <Text style={styles.reserveItemNotes}>{r.notes}</Text> : null}
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={PRIMARY} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Gericht für mehrere Tage ── */}
      <Modal visible={multiModalVisible} animationType="slide" transparent onRequestClose={() => setMultiModalVisible(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior="padding" keyboardVerticalOffset={0}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMultiModalVisible(false)} />
          <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + 16, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Gericht für mehrere Slots</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Titel-Zeile inkl. Reserve-Button */}
            <View style={styles.titleRow}>
              <TextInput
              style={[styles.input, { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={multiTitle}
              onChangeText={setMultiTitle}
              placeholder="Gericht eingeben..."
              placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <TouchableOpacity
                style={styles.reservePickBtn}
                onPress={() => setMultiReservePickVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="archive-outline" size={16} color={RESERVE_COLOR} />
                <Text style={styles.reservePickBtnText}>Reserve</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.segmentRow}>
              {ENTRY_STATUSES.map(st => (
                <TouchableOpacity
                  key={st}
                  style={[styles.segment, multiStatus === st && {
                    borderColor: STATUS_COLORS[st] ?? PRIMARY,
                    backgroundColor: (STATUS_COLORS[st] ?? PRIMARY) + '18',
                  }]}
                  onPress={() => setMultiStatus(st)}
                >
                  <Text style={[styles.segmentText, multiStatus === st && { color: STATUS_COLORS[st] ?? PRIMARY }]}>
                    {STATUS_LABELS[st]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Tage & Mahlzeiten wählen</Text>

            {/* Grid-Header */}
            <View style={styles.gridHeader}>
              <View style={{ width: 70 }} />
              {SLOTS.map(s => (
                <View key={s} style={styles.gridHeaderCell}>
                  <Ionicons name={SLOT_ICONS[s]} size={11} color={TEXT_MUTED} />
                  <Text style={styles.gridHeaderText}>{SLOT_LABELS[s].slice(0, 5)}</Text>
                </View>
              ))}
            </View>

            <ScrollView style={{ maxHeight: 230 }} showsVerticalScrollIndicator={false} scrollEnabled={false} nestedScrollEnabled={false}>
              {days.map(day => {
                const iso = toISO(day);
                const isToday = iso === todayISO;
                const dayColor = isToday ? colors.accent : colors.borderStrong;
                const rowHasSelection = SLOTS.some(s => multiSelections.has(`${iso}:${s}`));
                return (
                  <View
                    key={iso}
                    style={[
                      styles.gridRow,
                      { borderLeftWidth: 3, borderLeftColor: rowHasSelection ? colors.accent : dayColor },
                      rowHasSelection && { backgroundColor: colors.accentSurface },
                    ]}
                  >
            <Text style={[styles.gridDayLabel, { color: isToday ? dayColor : colors.text }, isToday && { fontWeight: '700' }]}>
                      {day.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                    </Text>
                    {SLOTS.map(slot => {
                      const key = `${iso}:${slot}`;
                      const selected = multiSelections.has(key);
                      return (
                        <TouchableOpacity
                          key={slot}
                          style={[
                            styles.gridCell,
                            selected && styles.gridCellActive,
                          ]}
                          onPress={() => toggleMultiSelection(iso, slot)}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        >
                          {selected
                            ? <Ionicons name="checkmark" size={15} color={dayColor} />
                            : <View style={styles.gridCellDot} />
                          }
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.multiSelCountRow}>
              <Text style={styles.multiSelCount}>
                {multiSelections.size === 0
                  ? 'Noch keine Auswahl'
                  : `${multiSelections.size} Slot${multiSelections.size !== 1 ? 's' : ''} ausgewählt`
                }
              </Text>
            </View>

            <TextInput
              style={[styles.input, { minHeight: 48, textAlignVertical: 'top', marginTop: 10 }]}
              value={multiNotes}
              onChangeText={setMultiNotes}
              placeholder="Notizen (optional)..."
              placeholderTextColor={TEXT_MUTED}
              multiline
            />

            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: 14 }, multiSelections.size === 0 && { opacity: 0.4 }]}
              onPress={saveMultiEntry}
              disabled={multiSelections.size === 0}
            >
              <Text style={styles.saveBtnText}>
                {multiSelections.size > 1
                  ? `${multiSelections.size}× Eintragen`
                  : 'Eintragen'
                }
              </Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Mini-Modal: Aus Reserve für Multi-Entry ── */}
      <Modal visible={multiReservePickVisible} animationType="slide" transparent onRequestClose={() => setMultiReservePickVisible(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMultiReservePickVisible(false)} />
          <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + 16, backgroundColor: colors.sheetBg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Ionicons name="archive-outline" size={18} color={RESERVE_COLOR} style={{ marginRight: 6 }} />
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Gericht aus Reserve</Text>
            </View>
            {reserveList.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="archive-outline" size={40} color={TEXT_MUTED} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>Reserve ist leer</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {reserveList.map(r => (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.pickItem}
                    activeOpacity={0.75}
                    onPress={() => {
                      setMultiTitle(r.title);
                      if (r.notes) setMultiNotes(r.notes);
                      setMultiReservePickVisible(false);
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.reserveItemTitle}>{r.title}</Text>
                      {r.notes ? <Text style={styles.reserveItemNotes}>{r.notes}</Text> : null}
                    </View>
                    <Ionicons name="arrow-up-circle-outline" size={22} color={RESERVE_COLOR} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal visible={deleteConfirmEntryId !== null} animationType="slide" transparent onRequestClose={() => setDeleteConfirmEntryId(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDeleteConfirmEntryId(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: TEXT }]}>Eintrag löschen</Text>
            <Text style={[styles.confirmMsg]}>Eintrag wirklich löschen?</Text>
            <View style={styles.sheetBtnRow}>
              <TouchableOpacity style={styles.sheetBtnCancel} onPress={() => setDeleteConfirmEntryId(null)}>
                <Text style={styles.sheetBtnCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetBtnDelete}
                onPress={async () => {
                  const id = deleteConfirmEntryId;
                  setDeleteConfirmEntryId(null);
                  if (id) { await ApiService.deleteMealPlanEntry(id); await loadEntries(); }
                }}
              >
                <Text style={styles.sheetBtnDeleteText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.colors.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      backgroundColor: t.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
      zIndex: 1,
    },
    headerTitle: { ...t.type.heading, color: t.colors.text },

    reserveBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.colors.surface,
      marginHorizontal: t.spacing.md,
      marginTop: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    reserveBarLeft: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    reserveBarText: { ...t.type.label, color: t.colors.warning },
    reserveBarHint: { ...t.type.caption, color: t.colors.textMuted },
    reserveBadge: {
      backgroundColor: t.colors.warning,
      borderRadius: t.radius.pill,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    reserveBadgeText: { ...t.type.caption, color: t.colors.onAccent },

    dayCard: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      marginTop: t.spacing.md,
      padding: t.spacing.md,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    todayCard: { borderColor: t.colors.accent },
    dayLabel: { ...t.type.bodyStrong, color: t.colors.text, marginBottom: t.spacing.sm },
    todayLabel: { color: t.colors.accent },

    slotRow: { marginBottom: t.spacing.xs + 2 },
    slotHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: t.spacing.xs },
    slotLabel: { ...t.type.caption, color: t.colors.textMuted, flex: 1 },
    slotBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },

    entryChip: {
      backgroundColor: t.colors.surfaceAlt,
      borderRadius: t.radius.sm,
      borderLeftWidth: 3,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      marginBottom: t.spacing.xs,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    entryChipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    entryTitle: { ...t.type.label, color: t.colors.text, flex: 1, marginRight: t.spacing.sm },
    statusPill: { paddingHorizontal: t.spacing.sm, paddingVertical: 2, borderRadius: t.radius.pill },
    statusPillText: { ...t.type.caption },
    entryNotes: { ...t.type.caption, color: t.colors.textMuted, marginTop: 2 },

    overlay: { flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: t.colors.sheetBg,
      borderTopLeftRadius: t.radius.sheet,
      borderTopRightRadius: t.radius.sheet,
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.md,
      ...t.elevation.e3,
    },
    sheetTall: { maxHeight: '82%' },
    sheetHandle: {
      width: 36,
      height: 4,
      backgroundColor: t.colors.handle,
      borderRadius: t.radius.pill,
      alignSelf: 'center',
      marginBottom: t.spacing.lg,
    },
    sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: t.spacing.lg },
    sheetTitle: { ...t.type.title, color: t.colors.text, flex: 1 },
    pickSlotLabel: { ...t.type.label, color: t.colors.accent },

    fieldLabel: {
      ...t.type.label,
      color: t.colors.textSub,
      marginBottom: t.spacing.sm,
      marginTop: t.spacing.lg,
    },
    input: {
      ...t.type.body,
      backgroundColor: t.colors.inputBg,
      color: t.colors.text,
      borderRadius: t.radius.md,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: t.colors.border,
      marginTop: t.spacing.xs,
    },
    segmentRow: { flexDirection: 'row', gap: t.spacing.sm },
    segment: {
      flex: 1,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      backgroundColor: t.colors.surfaceAlt,
    },
    segmentActive: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSurface },
    segmentText: { ...t.type.label, color: t.colors.textMuted },
    segmentTextActive: { color: t.colors.accent },

    modalActions: { flexDirection: 'row', marginTop: t.spacing.xl, gap: t.spacing.md },
    deleteBtn: {
      width: 48,
      height: 48,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtn: {
      flex: 1,
      height: 48,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: { ...t.type.bodyStrong, color: t.colors.onAccent },

    confirmMsg: { ...t.type.body, color: t.colors.textSub, marginBottom: t.spacing.xl },
    sheetBtnRow: { flexDirection: 'row', gap: t.spacing.md, marginTop: t.spacing.xs },
    sheetBtnCancel: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.surfaceAlt,
      alignItems: 'center',
    },
    sheetBtnCancelText: { ...t.type.bodyStrong, color: t.colors.text },
    sheetBtnDelete: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.danger,
      alignItems: 'center',
    },
    sheetBtnDeleteText: { ...t.type.bodyStrong, color: t.colors.onDanger },

    reserveAddRow: { flexDirection: 'row', alignItems: 'center', marginBottom: t.spacing.md },
    addReserveBtn: {
      width: 44,
      height: 44,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reserveItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    reserveItemTitle: { ...t.type.bodyStrong, color: t.colors.text },
    reserveItemNotes: { ...t.type.caption, color: t.colors.textMuted, marginTop: 1 },
    emptyBox: { alignItems: 'center', paddingVertical: t.spacing.xxl },
    emptyText: { ...t.type.body, color: t.colors.textMuted },

    pickItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },

    fab: {
      position: 'absolute',
      right: t.spacing.lg,
      width: 56,
      height: 56,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      ...t.elevation.e2,
    },

    gridHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing.xs,
      marginBottom: 2,
    },
    gridHeaderCell: { flex: 1, alignItems: 'center', gap: 2 },
    gridHeaderText: { ...t.type.caption, color: t.colors.textMuted },
    gridRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      paddingHorizontal: t.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    gridDayLabel: { ...t.type.caption, width: 70, color: t.colors.text },
    gridCell: {
      flex: 1,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.sm,
      marginHorizontal: 3,
      backgroundColor: t.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    gridCellActive: {
      backgroundColor: t.colors.accentSurface,
      borderColor: t.colors.accent,
    },
    gridCellDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.borderStrong },
    multiSelCountRow: { alignItems: 'center', marginTop: t.spacing.sm },
    multiSelCount: { ...t.type.caption, color: t.colors.textMuted },

    titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: t.spacing.xs },
    reservePickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.xs,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.warningSurface,
    },
    reservePickBtnText: { ...t.type.caption, color: t.colors.warning },

    headerDateBtn: { flexDirection: 'row', alignItems: 'center' },

    calMonthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.spacing.lg,
      paddingHorizontal: t.spacing.xs,
    },
    calMonthTitle: { ...t.type.heading, flex: 1, textAlign: 'center' },
    calWeekRow: { flexDirection: 'row', marginBottom: t.spacing.xs },
    calWeekLabel: {
      ...t.type.caption,
      flex: 1,
      textAlign: 'center',
      paddingVertical: t.spacing.xs,
    },
    calRow: { flexDirection: 'row', borderRadius: t.radius.sm, marginVertical: 1 },
    calRowSelected: { backgroundColor: t.colors.accentSurface },
    calCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: t.spacing.xs },
    calDayInner: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.pill,
    },
    calDayTodayBg: { backgroundColor: t.colors.accent },
    calDayText: { ...t.type.body },
    calDayTodayText: { color: t.colors.onAccent },
    calTodayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: t.spacing.lg,
      paddingVertical: t.spacing.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.colors.accentBorder,
      backgroundColor: t.colors.accentSurface,
    },
    calTodayBtnText: { ...t.type.label, color: t.colors.accent },
  });
