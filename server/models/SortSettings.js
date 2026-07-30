const mongoose = require('mongoose');

// Eine benutzerdefinierte Sortierung: benannte Reihenfolge von Tag-IDs.
const CustomSortSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    tagOrder: { type: [String], default: [] }
  },
  { _id: false }
);

// Singleton document — only one sort settings document exists
const SortSettingsSchema = new mongoose.Schema({
  activeSort: { type: String, default: 'default' },
  sortDirection: { type: String, default: 'asc' },
  // Ohne diese beiden Felder verwirft Mongoose (strict ist Default) die
  // eigenen Sortierungen des Clients beim Speichern stillschweigend. Der
  // Client machte aus dem fehlenden Feld beim Laden ein leeres Array und
  // ueberschrieb damit seinen lokalen Speicher -- der Server hat die
  // Sortierungen also nicht nur nicht gespeichert, sondern aktiv geloescht.
  activeSortId: { type: String, default: null },
  customSorts: { type: [CustomSortSchema], default: [] }
});

module.exports = mongoose.model('SortSettings', SortSettingsSchema);
