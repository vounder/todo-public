const mongoose = require('mongoose');

const TagSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  color: { type: String, default: '#6366f1' }
});

module.exports = mongoose.model('Tag', TagSchema);
