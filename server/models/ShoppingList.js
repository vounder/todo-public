const mongoose = require('mongoose');

const ShoppingItemEmbedSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  checked: { type: Boolean, default: false },
  checkedAt: { type: Number, default: null },
  createdAt: { type: Number },
  tags: [{ type: String }],
}, { _id: false });

const ShoppingListSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  createdAt: { type: Number, default: () => Date.now() },
  items: [ShoppingItemEmbedSchema],
});

module.exports = mongoose.model('ShoppingList', ShoppingListSchema);
