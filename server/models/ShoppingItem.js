const mongoose = require('mongoose');

const ShoppingItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  checked: { type: Boolean, default: false },
  checkedAt: { type: Number },
  tags: [{ type: String }],
  amount: { type: String },
  unit: { type: String }
});

module.exports = mongoose.model('ShoppingItem', ShoppingItemSchema);
