const mongoose = require('mongoose');

// Reserve-Liste: Pool von Mahlzeit-Ideen (ohne festes Datum)
const MealReserveSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  notes: { type: String },
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() }
});

module.exports = mongoose.model('MealReserve', MealReserveSchema);
