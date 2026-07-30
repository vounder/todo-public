const mongoose = require('mongoose');

const IngredientTagMappingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  ingredientName: { type: String, required: true },
  tagIds: { type: [String], default: [] }
});

module.exports = mongoose.model('IngredientTagMapping', IngredientTagMappingSchema);
