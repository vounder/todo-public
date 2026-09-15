import React, { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { View, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MealPlanEntry, MealSlot, MealStatus, Recipe } from '../types';
import { ApiService } from '../services/ApiService';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text, ScreenHeader, IconButton, Button, Fab, Sheet, Input, Chip, ListRow, Notice, SyncNotice, useSnackbar } from '../components';

type Reserve = { id: string; title: string; notes?: string };
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const SLOT_LABELS: Record<MealSlot, string> = { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen' };
const SLOT_ICONS: Record<MealSlot, keyof typeof Ionicons.glyphMap> = { breakfast: 'sunny-outline', lunch: 'restaurant-outline', dinner: 'moon-outline' };
function iso(date: Date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function parseDate(value: string) {
  const date = new Date(value + 'T12:00:00');
  return Number.isNaN(date.getTime()) || iso(date) !== value ? null : date;
}
function weekDays(base: Date) {
  const monday = new Date(base); monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; });
}
function shift(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
const dateLabel = (date: Date) => date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

export default function MealPlanScreen({ navigation }: any) {
  const { colors } = useTheme();
  const syncState = useSyncExternalStore(ApiService.subscribeSync, ApiService.getSyncSnapshot, ApiService.getSyncSnapshot);
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const current = useRef(entries);
  const [reserve, setReserve] = useState<Reserve[]>([]);
  const reserveRef = useRef(reserve);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const revision = useRef(0);
  const [base, setBase] = useState(new Date());
  const [panel, setPanel] = useState<'entry' | 'recipe' | 'reserve' | 'newReserve' | 'calendar' | null>(null);
  const [editing, setEditing] = useState<MealPlanEntry | null>(null);
  const [date, setDate] = useState(iso(new Date()));
  const [slot, setSlot] = useState<MealSlot>('dinner');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<MealStatus>('planned');
  const [recipeId, setRecipeId] = useState<string | undefined>();
  const [multiple, setMultiple] = useState(false);
  const [assignments, setAssignments] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [calendarTarget, setCalendarTarget] = useState<'week' | 'entry'>('week');
  const [month, setMonth] = useState(new Date());
  const [jumpDate, setJumpDate] = useState('');
  const [reserveTitle, setReserveTitle] = useState('');
  const [reserveNotes, setReserveNotes] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const snackbar = useSnackbar(88);

  const apply = (next: MealPlanEntry[]) => { current.current = next; setEntries(next); };
  const applyReserve = (next: Reserve[]) => { reserveRef.current = next; setReserve(next); };
  async function cacheEntries(next: MealPlanEntry[]) { apply(next); await AsyncStorage.setItem('@mealplan', JSON.stringify(next)); }
  async function cacheReserve(next: Reserve[]) { applyReserve(next); await AsyncStorage.setItem('@meal_reserve', JSON.stringify(next)); }
  const load = useCallback(async (isAlive: () => boolean = () => true) => {
    const before = revision.current;
    setLoading(true);
    try {
      const [local, localReserve, localRecipes] = await AsyncStorage.multiGet(['@mealplan', '@meal_reserve', '@recipes']);
      if (!isAlive()) return;
      apply(local[1] ? JSON.parse(local[1]) : []);
      applyReserve(localReserve[1] ? JSON.parse(localReserve[1]) : []);
      setRecipes(localRecipes[1] ? JSON.parse(localRecipes[1]) : []);
      const results = await Promise.allSettled([
        (async () => {
          const remote = await ApiService.fetchMealPlan();
          if (isAlive() && revision.current === before) await cacheEntries(remote);
        })(),
        (async () => {
          const remote = await ApiService.fetchMealReserve();
          if (isAlive() && revision.current === before) await cacheReserve(remote);
        })(),
      ]);
      if (isAlive()) setLoadError(results.some(result => result.status === 'rejected'));
    } catch { if (isAlive()) setLoadError(true); }
    finally { if (isAlive()) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    let alive = true; void load(() => alive);
    return () => { alive = false; };
  }, [load]));
  useEffect(() => {
    const unsubscribe = [
      ApiService.subscribe('mealPlan', apply), ApiService.subscribe('mealReserve', applyReserve), ApiService.subscribe('recipes', setRecipes),
    ];
    return () => unsubscribe.forEach(fn => fn());
  }, []);
  function openEntry(day = iso(new Date()), entry?: MealPlanEntry, idea?: Reserve) {
    setEditing(entry || null); setDate(entry?.date || day); setSlot(entry?.slot || 'dinner');
    setTitle(entry?.title || idea?.title || ''); setNotes(entry?.notes || idea?.notes || '');
    setStatus(entry?.status === 'wish' ? 'wish' : 'planned'); setRecipeId(entry?.recipeId);
    setMultiple(false); setAssignments([]); setError(''); setPanel('entry');
  }
  function calendar(target: 'week' | 'entry') {
    const initial = target === 'entry' ? parseDate(date) || new Date() : base;
    setMonth(initial); setJumpDate(iso(initial)); setCalendarTarget(target); setError(''); setPanel('calendar');
  }
  function chooseDate(value: string) {
    const parsed = parseDate(value);
    if (!parsed) { setError('Bitte ein gültiges Datum im Format JJJJ-MM-TT eingeben.'); return; }
    if (calendarTarget === 'week') { setBase(parsed); setPanel(null); }
    else { setDate(value); setAssignments([]); setPanel('entry'); }
    setError('');
  }
  async function saveEntry() {
    if (!title.trim() || busy) return;
    if (!parseDate(date)) { setError('Bitte ein gültiges Datum wählen.'); return; }
    if (multiple && !assignments.length) { setError('Wähle mindestens eine Mahlzeit aus.'); return; }
    setBusy(true); setError(''); revision.current++;
    let saved = 0;
    try {
      const data = { date, slot, title: title.trim(), notes: notes.trim(), status, recipeId: recipeId || '' };
      if (editing) {
        const updated = await ApiService.updateMealPlanEntry(editing.id, data);
        await cacheEntries(current.current.map(entry => entry.id === updated.id ? updated : entry));
        saved++;
      } else {
        const targets = multiple ? [...assignments] : [date + ':' + slot];
        for (const target of targets) {
          const [targetDate, targetSlot] = target.split(':');
          const created = await ApiService.createMealPlanEntry({ ...data, date: targetDate, slot: targetSlot as MealSlot });
          await cacheEntries([...current.current.filter(entry => entry.id !== created.id), created]);
          saved++;
          // Successful assignments disappear from the draft, so retrying only
          // sends remaining meals after a partial failure.
          setAssignments(previous => previous.filter(value => value !== target));
        }
      }
      setPanel(null);
      snackbar.show({ text: editing ? 'Mahlzeit aktualisiert' : saved === 1 ? 'Mahlzeit geplant' : saved + ' Mahlzeiten geplant' });
    } catch {
      setError((saved ? (saved === 1 ? 'Eine Mahlzeit gespeichert. ' : saved + ' Mahlzeiten gespeichert. ') + 'Die übrige Auswahl bleibt erhalten. ' : 'Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten. ') + 'Prüfe die Verbindung und versuche es erneut.');
    } finally { setBusy(false); revision.current++; }
  }
  async function removeEntry(entry: MealPlanEntry) {
    if (busy) return;
    setBusy(true); setError(''); revision.current++;
    try {
      await ApiService.deleteMealPlanEntry(entry.id);
      await cacheEntries(current.current.filter(value => value.id !== entry.id));
      setPanel(null);
      snackbar.show({ text: 'Mahlzeit entfernt', action: 'Rückgängig', onAction: async () => {
        revision.current++;
        const restored = await ApiService.createMealPlanEntry({ date: entry.date, slot: entry.slot, title: entry.title, status: entry.status, notes: entry.notes, recipeId: entry.recipeId });
        await cacheEntries([...current.current, restored]); revision.current++;
      } });
    } catch { setError('Entfernen fehlgeschlagen. Die Mahlzeit bleibt erhalten.'); }
    finally { setBusy(false); revision.current++; }
  }
  async function addReserve() {
    if (!reserveTitle.trim() || busy) return;
    setBusy(true); setError(''); revision.current++;
    try {
      const created = await ApiService.createMealReserveEntry(reserveTitle.trim(), reserveNotes.trim());
      await cacheReserve([...reserveRef.current, created]); setPanel('reserve'); setReserveTitle(''); setReserveNotes('');
    } catch { setError('Merken fehlgeschlagen. Deine Eingabe bleibt erhalten. Bitte erneut versuchen.'); }
    finally { setBusy(false); revision.current++; }
  }
  async function removeReserve(entry: Reserve) {
    if (busy) return;
    setBusy(true); setError(''); revision.current++;
    try {
      await ApiService.deleteMealReserveEntry(entry.id);
      await cacheReserve(reserveRef.current.filter(value => value.id !== entry.id));
      setPanel(null);
      snackbar.show({ text: 'Gericht aus „Für später“ entfernt', action: 'Rückgängig', onAction: async () => {
        revision.current++;
        const restored = await ApiService.createMealReserveEntry(entry.title, entry.notes);
        await cacheReserve([...reserveRef.current, restored]); revision.current++;
      } });
    } catch { setError('Entfernen fehlgeschlagen. Das Gericht bleibt erhalten.'); }
    finally { setBusy(false); revision.current++; }
  }

  const days = weekDays(base);
  const today = iso(new Date());
  const weekTitle = days[0].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) + ' – ' + days[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const thisWeek = days.some(day => iso(day) === today);
  const formDays = weekDays(parseDate(date) || base);
  const monthFirst = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (monthFirst.getDay() + 6) % 7;
  const monthLength = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const calendarCells = Array.from({ length: Math.ceil((offset + monthLength) / 7) * 7 }, (_, index) => index < offset || index >= offset + monthLength ? null : new Date(month.getFullYear(), month.getMonth(), index - offset + 1, 12));
  const filteredRecipes = recipes.filter(recipe => recipe.name.toLocaleLowerCase('de-DE').includes(search.toLocaleLowerCase('de-DE')));
  const calendarWidth = Math.max(336, width - 16);

  if (syncState.localOnly) return <View style={styles.container}>
    <ScreenHeader title="Planer" />
    <View style={{ padding: 24, gap: 20 }}>
      <Text style={styles.mealTitle}>Gemeinsam planen</Text>
      <Text>Der Essensplan und „Für später“ werden auf deinem Server gespeichert. Verbinde einen Server, um diese Funktionen zu nutzen. Aufgaben, Einkäufe und Gerichte kannst du bereits lokal verwalten.</Text>
      <Button standalone onPress={() => navigation.navigate('Settings')}>Server verbinden</Button>
    </View>
  </View>;
  return <View style={styles.container}>
    <ScreenHeader title="Essensplan" subtitle={thisWeek ? 'Deine Woche im Überblick' : 'Woche ab ' + days[0].toLocaleDateString('de-DE')} actions={[
      { icon: 'settings-outline', accessibilityLabel: 'App-Einstellungen', onPress: () => navigation.navigate('Settings') },
    ]} />
    <View style={styles.weekBar}>
      <IconButton icon="chevron-back" accessibilityLabel="Vorherige Woche" onPress={() => setBase(shift(base, -7))} />
      <Pressable style={styles.weekTitle} onPress={() => calendar('week')} accessibilityRole="button" accessibilityLabel={weekTitle + ', Datum wählen'}><Text style={styles.weekText}>{weekTitle}</Text><Ionicons name="chevron-down" size={15} color={colors.textSub} /></Pressable>
      <IconButton icon="chevron-forward" accessibilityLabel="Nächste Woche" onPress={() => setBase(shift(base, 7))} />
    </View>
    <View style={styles.tools}>
      <Button standalone variant={thisWeek ? 'ghost' : 'secondary'} icon="today-outline" onPress={() => setBase(new Date())}>Heute</Button>
      <Button standalone variant="secondary" icon="bookmark-outline" onPress={() => { setError(''); setPanel('reserve'); }}>{'Für später · ' + reserve.length}</Button>
    </View>
    {loadError ? <Notice tone="warning" message="Gespeicherter Stand. Aktualisieren war nicht möglich." action={loading ? 'Lädt …' : 'Erneut laden'} onAction={() => { if (!loading) void load(); }} /> : <SyncNotice />}
    <ScrollView contentContainerStyle={styles.agenda} showsVerticalScrollIndicator>
      {days.map(day => {
        const value = iso(day);
        const meals = entries.filter(entry => entry.date === value).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
        return <View key={value} style={[styles.day, value === today && styles.today]}>
          <View style={styles.dayHeader}><Text style={[styles.dayName, value === today && { color: colors.accent }]} accessibilityRole="header">{day.toLocaleDateString('de-DE', { weekday: 'long' })}</Text>
            <Text style={styles.dayDate}>{value === today ? 'Heute · ' : ''}{day.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}</Text></View>
          {meals.map(entry => <Pressable key={entry.id} style={styles.meal} onPress={() => openEntry(value, entry)} accessibilityRole="button" accessibilityLabel={entry.title + ', ' + SLOT_LABELS[entry.slot] + ', bearbeiten'}>
            <Ionicons name={SLOT_ICONS[entry.slot]} size={20} color={colors.textMuted} />
            <View style={{ flex: 1 }}><Text style={styles.mealTitle}>{entry.title}</Text><Text style={styles.caption}>{SLOT_LABELS[entry.slot]}{entry.status === 'wish' ? ' · Wunsch' : ''}</Text>
              {!!entry.notes && <Text style={styles.notes} numberOfLines={2}>{entry.notes}</Text>}</View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>)}
          <Pressable style={styles.addDay} onPress={() => openEntry(value)} accessibilityRole="button" accessibilityLabel={'Gericht für ' + dateLabel(day) + ' planen'}>
            <Ionicons name="add" size={20} color={colors.accent} /><Text style={styles.addLabel}>{meals.length ? 'Weitere Mahlzeit' : 'Gericht planen'}</Text>
          </Pressable>
        </View>;
      })}
    </ScrollView>
    <Fab icon="add" label="Gericht planen" accessibilityLabel="Gericht planen" onPress={() => openEntry(thisWeek ? today : iso(days[0]))} />

    <Sheet visible={panel === 'entry'} onClose={() => { if (!busy) setPanel(null); }} title={editing ? 'Mahlzeit bearbeiten' : 'Gericht planen'}
      footer={<Button standalone loading={busy} disabled={!title.trim() || (multiple && !assignments.length)} onPress={saveEntry}>
        {editing ? 'Änderungen speichern' : multiple ? assignments.length + (assignments.length === 1 ? ' Mahlzeit planen' : ' Mahlzeiten planen') : 'Mahlzeit planen'}
      </Button>}>
      <Input label="Gericht" value={title} onChangeText={value => { setTitle(value); setRecipeId(undefined); }} placeholder="Was möchtest du essen?" />
      <ListRow title="Aus meinen Gerichten wählen" icon="restaurant-outline" onPress={() => { setSearch(''); setPanel('recipe'); }} />
      {recipeId && <ListRow title="Zutaten des Gerichts ansehen" icon="open-outline" onPress={() => {
        const recipe = recipes.find(value => value.id === recipeId);
        if (recipe) { setPanel(null); navigation.navigate('RecipesTab', { screen: 'RecipeDetail', params: { recipe } }); }
      }} />}
      <ListRow title={dateLabel(parseDate(date) || new Date())} subtitle={multiple ? 'Woche für die Mehrfachauswahl' : 'Datum ändern'} icon="calendar-outline" onPress={() => calendar('entry')} />
      {!multiple && <View style={styles.wrap}>{SLOTS.map(value => <Chip key={value} label={SLOT_LABELS[value]} selected={slot === value} onPress={() => setSlot(value)} />)}</View>}
      {!editing && <ListRow title={multiple ? 'Nur eine Mahlzeit planen' : 'Für mehrere Tage planen'} icon={multiple ? 'remove-circle-outline' : 'duplicate-outline'} onPress={() => {
        setMultiple(!multiple); setAssignments(multiple ? [] : [date + ':' + slot]);
      }} />}
      {multiple && <View>
        <Text style={styles.hint}>Wähle die Mahlzeiten aus. Alle sieben Tage sind hier erreichbar.</Text>
        {formDays.map(day => <View key={iso(day)} style={styles.multiDay}>
          <Text style={styles.label} accessibilityRole="header">{dateLabel(day)}</Text>
          <View style={styles.wrap}>{SLOTS.map(value => {
            const key = iso(day) + ':' + value;
            return <Chip key={key} label={SLOT_LABELS[value]} selected={assignments.includes(key)} onPress={() => setAssignments(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key])} />;
          })}</View>
        </View>)}
      </View>}
      <Text style={styles.label}>Status</Text>
      <View style={styles.wrap}><Chip label="Geplant" selected={status === 'planned'} onPress={() => setStatus('planned')} /><Chip label="Wunsch" selected={status === 'wish'} onPress={() => setStatus('wish')} /></View>
      <Input label="Notiz (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Zum Beispiel: Reste für morgen einplanen" />
      {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
      {editing && <Button standalone variant="ghost" icon="trash-outline" disabled={busy} style={{ marginTop: 8 }} onPress={() => { void removeEntry(editing); }}>Mahlzeit entfernen</Button>}
    </Sheet>
    <Sheet visible={panel === 'recipe'} onClose={() => setPanel('entry')} title="Gericht wählen">
      <Input value={search} onChangeText={setSearch} placeholder="Gerichte durchsuchen" />
      {filteredRecipes.map(recipe => <ListRow key={recipe.id} title={recipe.name} subtitle={recipe.ingredients.length + ' Zutaten'} icon="restaurant-outline" onPress={() => {
        setTitle(recipe.name); setRecipeId(recipe.id); setPanel('entry');
      }} />)}
      {!filteredRecipes.length && <Text style={styles.hint}>Keine passenden Gerichte. Du kannst den Namen auch selbst eingeben.</Text>}
      {!!reserve.length && <><Text style={styles.label}>Für später gemerkt</Text>{reserve.filter(entry => entry.title.toLocaleLowerCase('de-DE').includes(search.toLocaleLowerCase('de-DE'))).map(entry => <ListRow key={entry.id} title={entry.title} icon="bookmark-outline" onPress={() => {
        setTitle(entry.title); setNotes(entry.notes || ''); setRecipeId(undefined); setPanel('entry');
      }} />)}</>}
    </Sheet>
    <Sheet visible={panel === 'reserve'} onClose={() => { if (!busy) setPanel(null); }} title="Für später" subtitle="Ideen ohne festen Termin. Tippe auf ein Gericht, um es einzuplanen.">
      {reserve.map(entry => <View key={entry.id} style={styles.reserveRow}>
        <View style={{ flex: 1 }}><ListRow title={entry.title} subtitle={entry.notes} icon="bookmark-outline" onPress={() => { if (!busy) openEntry(thisWeek ? today : iso(days[0]), undefined, entry); }} /></View>
        <IconButton icon="trash-outline" accessibilityLabel={entry.title + ' aus Für später entfernen'} disabled={busy} onPress={() => { void removeReserve(entry); }} />
      </View>)}
      {!reserve.length && <Text style={styles.hint}>Hier ist Platz für deine nächsten Kochideen.</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button standalone icon="add" disabled={busy} onPress={() => { setReserveTitle(''); setReserveNotes(''); setError(''); setPanel('newReserve'); }}>Gericht merken</Button>
    </Sheet>
    <Sheet visible={panel === 'newReserve'} onClose={() => { if (!busy) setPanel('reserve'); }} title="Gericht für später merken">
      <Input label="Gericht" value={reserveTitle} onChangeText={setReserveTitle} autoFocus />
      <Input label="Notiz (optional)" value={reserveNotes} onChangeText={setReserveNotes} multiline containerStyle={{ marginTop: 16 }} />
      {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
      <Button standalone loading={busy} disabled={!reserveTitle.trim()} style={{ marginTop: 16 }} onPress={addReserve}>Merken</Button>
    </Sheet>
    <Sheet visible={panel === 'calendar'} onClose={() => setPanel(calendarTarget === 'entry' ? 'entry' : null)} title={calendarTarget === 'week' ? 'Woche auswählen' : 'Datum auswählen'}>
      <View style={styles.weekBar}><IconButton icon="chevron-back" accessibilityLabel="Vorheriger Monat" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))} />
        <Text style={[styles.weekText, { flex: 1, textAlign: 'center' }]}>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</Text>
        <IconButton icon="chevron-forward" accessibilityLabel="Nächster Monat" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))} /></View>
      <ScrollView horizontal style={{ marginHorizontal: -12 }} contentContainerStyle={{ width: calendarWidth }}>
        <View style={{ width: calendarWidth }}>
          <View style={styles.calendarRow}>{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => <Text key={day} style={[styles.calendarWeekday, { width: calendarWidth / 7 }]}>{day}</Text>)}</View>
          <View style={styles.calendarRow}>{calendarCells.map((day, index) => day ? <Pressable key={index} style={[styles.calendarCell, { width: calendarWidth / 7 }, iso(day) === jumpDate && styles.selectedDate]}
            accessibilityRole="button" accessibilityLabel={dateLabel(day)} accessibilityState={{ selected: iso(day) === jumpDate }} onPress={() => chooseDate(iso(day))}>
            <Text style={{ color: iso(day) === jumpDate ? colors.onAccent : iso(day) === today ? colors.accent : colors.text, fontSize: 16, fontWeight: iso(day) === today ? '700' : '400' }}>{day.getDate()}</Text>
          </Pressable> : <View key={index} style={{ width: calendarWidth / 7, minHeight: 48 }} />)}</View>
        </View>
      </ScrollView>
      <Button standalone variant="ghost" onPress={() => chooseDate(today)}>Zu heute</Button>
      <Input label="Direkt zu einem Datum" placeholder="JJJJ-MM-TT" value={jumpDate} onChangeText={setJumpDate} error={error} />
      <Button standalone style={{ marginTop: 12 }} onPress={() => chooseDate(jumpDate)}>Datum übernehmen</Button>
    </Sheet>
    {snackbar.element}
  </View>;
}
const createStyles = (t: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg },
  weekBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  weekTitle: { flex: 1, minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  weekText: { color: t.colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  agenda: { paddingHorizontal: 16, paddingBottom: 100 },
  day: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.tabBorder, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, marginBottom: 12 },
  today: { borderColor: t.colors.accentBorder },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, paddingBottom: 10 },
  dayName: { color: t.colors.text, fontSize: 17, fontWeight: '600' },
  dayDate: { color: t.colors.textMuted, fontSize: 12 },
  meal: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: t.colors.tabBorder },
  mealTitle: { color: t.colors.text, fontSize: 16, lineHeight: 23, fontWeight: '500' },
  caption: { color: t.colors.textMuted, fontSize: 12, marginTop: 3 },
  notes: { color: t.colors.textSub, fontSize: 13, lineHeight: 19, marginTop: 6 },
  addDay: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderColor: t.colors.tabBorder },
  addLabel: { color: t.colors.accent, fontSize: 14, fontWeight: '500', flexShrink: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  label: { color: t.colors.textSub, fontSize: 14, fontWeight: '600', marginTop: 10 },
  hint: { color: t.colors.textSub, fontSize: 14, lineHeight: 21, marginVertical: 12 },
  error: { color: t.colors.danger, fontSize: 14, lineHeight: 21, marginVertical: 12 },
  multiDay: { paddingVertical: 4, borderBottomWidth: 1, borderColor: t.colors.tabBorder },
  reserveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  calendarRow: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarWeekday: { textAlign: 'center', paddingVertical: 8, color: t.colors.textMuted, fontSize: 12 },
  calendarCell: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  selectedDate: { backgroundColor: t.colors.accent },
});
