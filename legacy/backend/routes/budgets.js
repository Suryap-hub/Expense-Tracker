const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const auth = require('../middleware/auth');

// GET /api/budgets
router.get('/', auth, async (req, res) => {
  try {
    let budget = await Budget.findOne({ userId: req.user._id });
    if (!budget) {
      budget = await Budget.create({ userId: req.user._id, monthlyBudget: 50000 });
    }
    res.json({ budget });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budget.' });
  }
});

// PUT /api/budgets
router.put('/', auth, async (req, res) => {
  try {
    const { monthlyBudget, categoryBudgets, alertThreshold, notifications } = req.body;

    const budget = await Budget.findOneAndUpdate(
      { userId: req.user._id },
      {
        ...(monthlyBudget && { monthlyBudget }),
        ...(categoryBudgets && { categoryBudgets }),
        ...(alertThreshold && { alertThreshold }),
        ...(notifications && { notifications })
      },
      { new: true, upsert: true }
    );

    res.json({ message: 'Budget updated!', budget });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update budget.' });
  }
});

module.exports = router;
