const mongoose = require('mongoose');

const TodoItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Number, default: () => Date.now() },
  tags: [{ type: String }],
  notes: { type: String }
}, { _id: false });

const TodoListSettingsSchema = new mongoose.Schema({
  autoDeleteEnabled: { type: Boolean, default: false },
  autoDeleteCompletedAfterHours: { type: Number, default: 12 }
}, { _id: false });

const TodoListSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  createdAt: { type: Number, default: () => Date.now() },
  items: [TodoItemSchema],
  settings: TodoListSettingsSchema
});

// Preserve insertion order via explicit ordering array
module.exports = mongoose.model('TodoList', TodoListSchema);
