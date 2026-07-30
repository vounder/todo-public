const mongoose = require('mongoose');

const IngredientSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  amount: { type: String },
  unit: { type: String },
  tags: [{ type: String }]
}, { _id: false });

const RecipeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  ingredients: [IngredientSchema],
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: null },
  notes: { type: String },
  healthLevel: { type: String, enum: ['sehr_gesund', 'gesund', 'weniger_gesund', 'ungesund'], default: null },
  icon: { type: String, default: null }
});

module.exports = mongoose.model('Recipe', RecipeSchema);
