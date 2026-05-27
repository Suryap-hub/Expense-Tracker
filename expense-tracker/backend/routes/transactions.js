const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const auth = require('../middleware/auth');

// GET /api/transactions
router.get('/', auth, async (req, res) => {
  try {
    const {
      type, category, startDate, endDate,
      page = 1, limit = 20, sort = '-date'
    } = req.query;

    const filter = { userId: req.user._id };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort(sort).skip(skip).limit(parseInt(limit)),
      Transaction.countDocuments(filter)
    ]);

    res.json({
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

// GET /api/transactions/summary
router.get('/summary', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const targetMonth = month ? parseInt(month) - 1 : now.getMonth();
    const targetYear = year ? parseInt(year) : now.getFullYear();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    const transactions = await Transaction.find({
      userId: req.user._id,
      date: { $gte: startDate, $lte: endDate }
    });

    const summary = {
      totalIncome: 0,
      totalExpenses: 0,
      balance: 0,
      byCategory: {},
      transactionCount: transactions.length
    };

    transactions.forEach(t => {
      if (t.type === 'income') {
        summary.totalIncome += t.amount;
      } else {
        summary.totalExpenses += t.amount;
        summary.byCategory[t.category] = (summary.byCategory[t.category] || 0) + t.amount;
      }
    });

    summary.balance = summary.totalIncome - summary.totalExpenses;

    // Get budget info
    const budget = await Budget.findOne({ userId: req.user._id });
    if (budget) {
      summary.monthlyBudget = budget.monthlyBudget;
      summary.budgetUsed = (summary.totalExpenses / budget.monthlyBudget) * 100;
      summary.budgetAlert = summary.budgetUsed >= budget.alertThreshold;
    }

    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary.' });
  }
});

// GET /api/transactions/trends
router.get('/trends', auth, async (req, res) => {
  try {
    const months = 6;
    const trends = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

      const result = await Transaction.aggregate([
        {
          $match: {
            userId: req.user._id,
            date: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$type',
            total: { $sum: '$amount' }
          }
        }
      ]);

      const monthData = {
        month: startDate.toLocaleString('default', { month: 'short' }),
        year: startDate.getFullYear(),
        income: 0,
        expenses: 0
      };

      result.forEach(r => {
        if (r._id === 'income') monthData.income = r.total;
        if (r._id === 'expense') monthData.expenses = r.total;
      });

      trends.push(monthData);
    }

    res.json({ trends });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trends.' });
  }
});

// POST /api/transactions
router.post('/', auth, [
  body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('category').isIn(['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Salary', 'Investment', 'Other']).withMessage('Invalid category'),
  body('description').trim().isLength({ min: 1, max: 200 }).withMessage('Description is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, amount, category, description, notes, date, aiGenerated } = req.body;

    const transaction = await Transaction.create({
      userId: req.user._id,
      type,
      amount: parseFloat(amount),
      category,
      description,
      notes,
      date: date ? new Date(date) : new Date(),
      aiGenerated: aiGenerated || false
    });

    res.status(201).json({ message: 'Transaction added!', transaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add transaction.' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const { type, amount, category, description, notes, date } = req.body;
    if (type) transaction.type = type;
    if (amount) transaction.amount = parseFloat(amount);
    if (category) transaction.category = category;
    if (description) transaction.description = description;
    if (notes !== undefined) transaction.notes = notes;
    if (date) transaction.date = new Date(date);

    await transaction.save();
    res.json({ message: 'Transaction updated!', transaction });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    res.json({ message: 'Transaction deleted!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

module.exports = router;
