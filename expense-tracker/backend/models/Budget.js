const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  monthlyBudget: {
    type: Number,
    required: [true, 'Monthly budget is required'],
    min: [1, 'Budget must be positive']
  },
  categoryBudgets: {
    Food: { type: Number, default: 0 },
    Travel: { type: Number, default: 0 },
    Shopping: { type: Number, default: 0 },
    Bills: { type: Number, default: 0 },
    Entertainment: { type: Number, default: 0 },
    Health: { type: Number, default: 0 },
    Other: { type: Number, default: 0 }
  },
  alertThreshold: {
    type: Number,
    default: 80, // Alert at 80% of budget
    min: 1,
    max: 100
  },
  notifications: {
    budgetAlert: { type: Boolean, default: true },
    weeklySummary: { type: Boolean, default: true },
    aiTips: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Budget', budgetSchema);
