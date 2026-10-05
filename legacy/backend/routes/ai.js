const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Multer setup for receipt uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `receipt_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only image files and PDFs are allowed'));
  }
});

// Helper to call Gemini
async function callGemini(prompt, imagePart = null) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const parts = imagePart ? [imagePart, { text: prompt }] : [{ text: prompt }];
  const result = await model.generateContent(parts);
  return result.response.text();
}

// POST /api/ai/categorize
// Categorize expense from natural language
router.post('/categorize', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required.' });

    const prompt = `You are a financial assistant. Analyze this expense description and extract structured data.

User input: "${text}"

Extract and return ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "amount": <number, the expense amount>,
  "category": <one of: "Food", "Travel", "Shopping", "Bills", "Entertainment", "Health", "Salary", "Investment", "Other">,
  "type": <"income" or "expense">,
  "description": <short clean description, max 100 chars>,
  "confidence": <0-100, how confident you are>
}

Rules:
- If no amount found, set amount to 0
- Choose the most appropriate category
- For salary/earnings, use type "income"
- For purchases/spending, use type "expense"
- Description should be clean and professional`;

    const response = await callGemini(prompt);

    // Parse JSON safely
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    const parsed = JSON.parse(jsonMatch[0]);

    res.json({
      success: true,
      result: {
        amount: Math.abs(parseFloat(parsed.amount) || 0),
        category: parsed.category || 'Other',
        type: parsed.type || 'expense',
        description: parsed.description || text,
        confidence: parsed.confidence || 80
      }
    });
  } catch (err) {
    console.error('AI categorize error:', err);
    res.status(500).json({ error: 'AI categorization failed. Please try again.' });
  }
});

// POST /api/ai/insights
// Generate financial insights
router.post('/insights', auth, async (req, res) => {
  try {
    // Fetch last 3 months of transactions
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const transactions = await Transaction.find({
      userId: req.user._id,
      date: { $gte: threeMonthsAgo }
    }).sort('-date').limit(200);

    const budget = await Budget.findOne({ userId: req.user._id });

    // Build summary for AI
    const now = new Date();
    const thisMonth = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const lastMonth = transactions.filter(t => {
      const d = new Date(t.date);
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    });

    const thisMonthExpenses = thisMonth.filter(t => t.type === 'expense');
    const lastMonthExpenses = lastMonth.filter(t => t.type === 'expense');
    const thisMonthIncome = thisMonth.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
    const thisMonthTotal = thisMonthExpenses.reduce((a, t) => a + t.amount, 0);
    const lastMonthTotal = lastMonthExpenses.reduce((a, t) => a + t.amount, 0);

    const categoryBreakdown = {};
    thisMonthExpenses.forEach(t => {
      categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;
    });

    const lastCategoryBreakdown = {};
    lastMonthExpenses.forEach(t => {
      lastCategoryBreakdown[t.category] = (lastCategoryBreakdown[t.category] || 0) + t.amount;
    });

    const prompt = `You are a personal finance advisor AI. Analyze this user's spending data and provide actionable insights.

FINANCIAL DATA:
- Monthly Budget: ₹${budget?.monthlyBudget || 'Not set'}
- This Month Total Expenses: ₹${thisMonthTotal.toFixed(2)}
- This Month Income: ₹${thisMonthIncome.toFixed(2)}
- Last Month Total Expenses: ₹${lastMonthTotal.toFixed(2)}
- Budget Used: ${budget ? ((thisMonthTotal / budget.monthlyBudget) * 100).toFixed(1) : 'N/A'}%

This Month Category Breakdown (expenses):
${Object.entries(categoryBreakdown).map(([cat, amt]) => `- ${cat}: ₹${amt.toFixed(2)}`).join('\n') || '- No expenses this month'}

Last Month Category Breakdown (expenses):
${Object.entries(lastCategoryBreakdown).map(([cat, amt]) => `- ${cat}: ₹${amt.toFixed(2)}`).join('\n') || '- No data'}

Total transactions analyzed: ${transactions.length}

Provide a comprehensive financial analysis as a JSON object (no markdown, no explanation):
{
  "summary": "<2-3 sentence overview of financial health>",
  "insights": [
    "<specific insight 1 with numbers>",
    "<specific insight 2 with numbers>",
    "<specific insight 3 with numbers>"
  ],
  "savingsSuggestions": [
    "<actionable saving tip 1>",
    "<actionable saving tip 2>",
    "<actionable saving tip 3>"
  ],
  "unnecessaryExpenses": [
    "<category or pattern that seems excessive>"
  ],
  "budgetRecommendations": [
    "<specific budget recommendation>"
  ],
  "spendingScore": <1-100, overall financial health score>,
  "monthlyChangePercent": <percentage change from last month, positive = more spending>,
  "topSpendingCategory": "<category with most spending this month>",
  "riskLevel": "<low/medium/high - overspending risk>"
}`;

    const response = await callGemini(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');

    const insights = JSON.parse(jsonMatch[0]);

    res.json({ success: true, insights });
  } catch (err) {
    console.error('AI insights error:', err);
    res.status(500).json({ error: 'Failed to generate insights. Please try again.' });
  }
});

// POST /api/ai/receipt
// Scan receipt image
router.post('/receipt', auth, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Receipt image is required.' });
    }

    const filePath = req.file.path;
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    const mimeType = req.file.mimetype;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    };

    const prompt = `You are a receipt scanner. Extract expense information from this receipt image.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "amount": <total amount as number>,
  "category": <one of: "Food", "Travel", "Shopping", "Bills", "Entertainment", "Health", "Other">,
  "description": <merchant name or item description, max 100 chars>,
  "date": <date in YYYY-MM-DD format if visible, otherwise null>,
  "items": [
    {"name": "<item name>", "price": <price>}
  ],
  "merchant": "<merchant/store name if visible>",
  "confidence": <0-100>
}

If you cannot read the receipt clearly, set confidence below 50.`;

    const response = await callGemini(prompt, imagePart);

    // Clean up uploaded file
    fs.unlink(filePath, () => {});

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse receipt data');

    const receiptData = JSON.parse(jsonMatch[0]);

    res.json({
      success: true,
      result: {
        amount: Math.abs(parseFloat(receiptData.amount) || 0),
        category: receiptData.category || 'Other',
        type: 'expense',
        description: receiptData.description || 'Receipt scan',
        date: receiptData.date || new Date().toISOString().split('T')[0],
        items: receiptData.items || [],
        merchant: receiptData.merchant || '',
        confidence: receiptData.confidence || 70
      }
    });
  } catch (err) {
    console.error('Receipt scan error:', err);
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Receipt scanning failed. Please try again.' });
  }
});

// POST /api/ai/budget-predict
router.post('/budget-predict', auth, async (req, res) => {
  try {
    const budget = await Budget.findOne({ userId: req.user._id });
    if (!budget) return res.status(400).json({ error: 'No budget set.' });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();

    const transactions = await Transaction.find({
      userId: req.user._id,
      type: 'expense',
      date: { $gte: startOfMonth }
    });

    const spent = transactions.reduce((a, t) => a + t.amount, 0);
    const dailyRate = spent / daysPassed;
    const projectedMonthly = dailyRate * daysInMonth;
    const remaining = budget.monthlyBudget - spent;
    const overbudgetRisk = projectedMonthly > budget.monthlyBudget;

    const prompt = `Financial budget prediction analysis:
- Monthly Budget: ₹${budget.monthlyBudget}
- Days passed: ${daysPassed}/${daysInMonth}
- Amount spent so far: ₹${spent.toFixed(2)}
- Daily spending rate: ₹${dailyRate.toFixed(2)}
- Projected monthly spending: ₹${projectedMonthly.toFixed(2)}
- Budget remaining: ₹${remaining.toFixed(2)}

Return ONLY JSON (no markdown):
{
  "prediction": "<one sentence prediction>",
  "riskLevel": "<low/medium/high>",
  "tips": ["<tip 1>", "<tip 2>"],
  "projectedTotal": ${projectedMonthly.toFixed(2)},
  "willOverBudget": ${overbudgetRisk},
  "daysRemainingFunds": <estimated days money will last at current rate>
}`;

    const response = await callGemini(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const prediction = JSON.parse(jsonMatch[0]);

    res.json({
      success: true,
      prediction: {
        ...prediction,
        spent,
        budget: budget.monthlyBudget,
        remaining,
        projectedTotal: projectedMonthly,
        budgetUsedPercent: (spent / budget.monthlyBudget * 100).toFixed(1)
      }
    });
  } catch (err) {
    console.error('Budget predict error:', err);
    res.status(500).json({ error: 'Prediction failed.' });
  }
});

module.exports = router;
