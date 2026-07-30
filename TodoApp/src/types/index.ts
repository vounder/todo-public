// Datenmodell für Todo-Listen und Einträge
export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number | null; // Zeitpunkt des Abhakens (für korrektes Auto-Delete)
}

export interface TodoList {
  id: string;
  name: string;
  createdAt: number;
  items: TodoItem[];
  settings?: {
    autoDeleteEnabled?: boolean;
    autoDeleteCompletedAfterHours?: number;
  };
}

// Tags für Kategorisierung
export interface Tag {
  id: string;
  name: string;
  color: string;
}

// Gelernte Tag-Zuweisungen für Einkaufsliste
// Wird automatisch befüllt wenn ein Item in der Einkaufsliste einen Tag erhält
export interface IngredientTagMapping {
  ingredientName: string; // normierter Itemname (lowercase)
  tagIds: string[];       // gelernte Tag IDs
}

// Sortierungen
export type SortType = 'default' | 'a-z' | 'z-a' | 'length-asc' | 'length-desc' | 'custom';

export interface CustomSort {
  id: string;
  name: string;
  tagOrder: string[]; // Array of tag IDs in desired order
}

export interface SortSettings {
  activeSort: SortType;
  activeSortId?: string; // ID of custom sort if activeSort === 'custom'
  customSorts: CustomSort[];
}

// Gerichte (Recipes)
export type HealthLevel = 'sehr_gesund' | 'gesund' | 'weniger_gesund' | 'ungesund';

export interface Ingredient {
  id: string;
  name: string;
  amount: string;
  unit: string;
  tags?: string[]; // Tag IDs
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[];
  createdAt: number;
  updatedAt?: number;
  healthLevel?: HealthLevel;
  icon?: string;
}

// Einkaufsliste (Shopping List)
export interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  createdAt: number;
  checkedAt?: number | null;
  tags?: string[]; // Tag IDs
}

// Mehrere Einkaufslisten
export interface ShoppingListDef {
  id: string;
  name: string;
  createdAt: number;
  items: ShoppingItem[];
}

// Globale App-Einstellungen
export interface AppSettings {
  autoDeleteCheckedShoppingAfterHours?: number;
}

// Für zukünftige Server-Synchronisation
export interface SyncStatus {
  lastSyncedAt: number;
  pendingChanges: boolean;
}

// ============================================
// Essenskalender / Meal Plan
// ============================================

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';
export type MealStatus = 'wish' | 'planned' | 'reserve';

export interface MealPlanEntry {
  id: string;
  date: string;           // "YYYY-MM-DD"
  slot: MealSlot;
  title: string;
  status: MealStatus;
  recipeId?: string;      // optional link to Recipe
  notes?: string;
  assignedDate?: string;  // for reserve entries: date they are assigned to
  createdAt: number;
  updatedAt: number;
}

// Grouped by date for UI rendering
export type MealPlanDay = {
  date: string;
  breakfast: MealPlanEntry[];
  lunch: MealPlanEntry[];
  dinner: MealPlanEntry[];
};
