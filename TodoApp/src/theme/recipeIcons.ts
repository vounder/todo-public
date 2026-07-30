import { Ionicons } from '@expo/vector-icons';
import { HealthLevel } from '../types';
import { Palette } from './tokens';

export interface RecipeIcon {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * Auswaehlbare Rezept-Icons.
 *
 * Frueher standen hier zusaetzlich 16 Eintraege, die statt eines Icons ein
 * Food-Emoji gerendert haben (Kartoffel, Karotte, Steak ...). Die sind raus:
 * Ionicons hat keine eigenen Glyphen dafuer, ein Mapping haette 16 Kacheln
 * ergeben, die visuell nur vier sich wiederholende Icons sind.
 *
 * Die alten Keys leben in LEGACY_ICON_ALIASES weiter -- Recipe.icon liegt in
 * der Datenbank, bestehende Rezepte muessen weiter aufloesen.
 *
 * Die frueheren Per-Icon-Farben (30 Hexwerte, in keiner Theme-Datei
 * vorhanden) sind ersatzlos entfallen; die Kachel ist neutral, die Auswahl
 * wird ueber den Akzent markiert.
 */
export const RECIPE_ICONS: RecipeIcon[] = [
  { key: 'restaurant-outline', label: 'Standard', icon: 'restaurant-outline' },
  { key: 'pizza-outline', label: 'Pizza', icon: 'pizza-outline' },
  { key: 'fast-food-outline', label: 'Burger', icon: 'fast-food-outline' },
  { key: 'fish-outline', label: 'Fisch', icon: 'fish-outline' },
  { key: 'nutrition-outline', label: 'Salat', icon: 'nutrition-outline' },
  { key: 'leaf-outline', label: 'Vegetarisch', icon: 'leaf-outline' },
  { key: 'flame-outline', label: 'Grill', icon: 'flame-outline' },
  { key: 'cafe-outline', label: 'Frühstück', icon: 'cafe-outline' },
  { key: 'beer-outline', label: 'Snacks', icon: 'beer-outline' },
  { key: 'wine-outline', label: 'Fein', icon: 'wine-outline' },
  { key: 'ice-cream-outline', label: 'Dessert', icon: 'ice-cream-outline' },
  { key: 'sunny-outline', label: 'Leicht', icon: 'sunny-outline' },
  { key: 'water-outline', label: 'Suppe', icon: 'water-outline' },
  { key: 'heart-outline', label: 'Liebling', icon: 'heart-outline' },
  { key: 'earth-outline', label: 'Weltküche', icon: 'earth-outline' },
  { key: 'basket-outline', label: 'Saisonal', icon: 'basket-outline' },
];

/** Alte emoji-* Keys aus der Datenbank auf das naechstliegende Icon. */
export const LEGACY_ICON_ALIASES: Record<string, string> = {
  'emoji-kartoffel': 'nutrition-outline',
  'emoji-karotte': 'nutrition-outline',
  'emoji-tomate': 'nutrition-outline',
  'emoji-mais': 'nutrition-outline',
  'emoji-brokkoli': 'leaf-outline',
  'emoji-lauch': 'leaf-outline',
  'emoji-zwiebel': 'leaf-outline',
  'emoji-gurke': 'leaf-outline',
  'emoji-knoblauch': 'leaf-outline',
  'emoji-paprika': 'flame-outline',
  'emoji-speck': 'flame-outline',
  'emoji-steak': 'restaurant-outline',
  'emoji-haehnchenkeule': 'restaurant-outline',
  'emoji-schwein': 'restaurant-outline',
  'emoji-lamm': 'restaurant-outline',
  'emoji-wurst': 'fast-food-outline',
};

export function getRecipeIcon(key?: string): RecipeIcon {
  if (!key) return RECIPE_ICONS[0];
  return (
    RECIPE_ICONS.find(i => i.key === key) ??
    RECIPE_ICONS.find(i => i.key === LEGACY_ICON_ALIASES[key]) ??
    RECIPE_ICONS[0]
  );
}

export interface HealthConfigEntry {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Semantik-Token statt eigener Hexwerte. Vier Stufen brauchen vier
   * unterscheidbare Farben; der Akzent sitzt neutral zwischen gut und
   * schlecht, weil die Palette nur ein Gruen kennt.
   */
  tone: 'success' | 'accent' | 'warning' | 'danger';
}

export const HEALTH_CONFIG: Record<HealthLevel, HealthConfigEntry> = {
  sehr_gesund: { label: 'Sehr gesund', icon: 'leaf-outline', tone: 'success' },
  gesund: { label: 'Gesund', icon: 'heart-outline', tone: 'accent' },
  weniger_gesund: { label: 'Weniger gesund', icon: 'alert-circle-outline', tone: 'warning' },
  ungesund: { label: 'Ungesund', icon: 'close-circle-outline', tone: 'danger' },
};

/** Loest die Gesundheitsstufe gegen die aktive Palette auf. */
export function healthColor(level: HealthLevel, c: Palette): string {
  return c[HEALTH_CONFIG[level].tone];
}

export const ALL_HEALTH_LEVELS: HealthLevel[] = [
  'sehr_gesund',
  'gesund',
  'weniger_gesund',
  'ungesund',
];
