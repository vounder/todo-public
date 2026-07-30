const mongoose = require('mongoose');

// date: ISO date string "YYYY-MM-DD"
// slot: breakfast | lunch | dinner
// status: wish | planned | reserve
const MealPlanSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  date: { type: String, required: true },          // "2025-01-20"
  slot: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
  title: { type: String, required: true },
  status: { type: String, enum: ['wish', 'planned', 'reserve'], default: 'planned' },
  recipeId: { type: String },                       // optional link to a Recipe
  notes: { type: String },
  assignedDate: { type: String },                   // reserve items can be assigned to a day
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() }
});

// Compound index for efficient week queries
MealPlanSchema.index({ date: 1, slot: 1 });

module.exports = mongoose.model('MealPlan', MealPlanSchema);
