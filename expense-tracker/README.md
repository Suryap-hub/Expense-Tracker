# 🤖 AI Smart Expense Tracker

A full-stack AI-powered expense tracker built with React, Node.js, MongoDB Atlas, and Google Gemini API.

---

## ✨ Features

- **JWT Authentication** — Secure register/login with bcrypt password hashing
- **Expense Management** — Full CRUD for income & expenses with 9 categories
- **AI Smart Entry** — Type natural language, Gemini extracts amount + category
- **Receipt Scanner** — Upload bill image → Gemini OCR → auto-create entry
- **AI Financial Insights** — Monthly analysis, savings tips, health score
- **Budget Prediction** — AI predicts overspending risk for the month
- **Analytics Dashboard** — Charts: pie, bar, area, line with Recharts
- **Smart Budgeting** — Monthly budget + category limits + alert threshold
- **Dark Mode** — Default dark theme with light mode toggle
- **Mobile Responsive** — Works perfectly on all screen sizes

---

## 🗂️ Project Structure

```
expense-tracker/
├── backend/
│   ├── models/
│   │   ├── User.js
│   │   ├── Transaction.js
│   │   └── Budget.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── transactions.js
│   │   ├── budgets.js
│   │   └── ai.js
│   ├── middleware/
│   │   └── auth.js
│   ├── uploads/          ← receipt images (auto-created)
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/
    │   │   └── Layout.js
    │   ├── context/
    │   │   ├── AuthContext.js
    │   │   └── ThemeContext.js
    │   ├── pages/
    │   │   ├── Login.js
    │   │   ├── Register.js
    │   │   ├── Dashboard.js
    │   │   ├── Transactions.js
    │   │   ├── AddTransaction.js
    │   │   ├── Analytics.js
    │   │   ├── AIInsights.js
    │   │   ├── BudgetSettings.js
    │   │   └── ReceiptScanner.js
    │   ├── utils/
    │   │   └── api.js
    │   ├── App.js
    │   ├── index.js
    │   └── index.css
    ├── tailwind.config.js
    └── package.json
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- MongoDB Atlas account (free tier works)
- Google Gemini API key (free at ai.google.dev)

---

## Step 1 — Get API Keys

### MongoDB Atlas
1. Go to https://cloud.mongodb.com
2. Create a free cluster (M0 Sandbox)
3. Create a database user (username + password)
4. Go to **Network Access** → Add IP → Allow from anywhere (0.0.0.0/0)
5. Go to **Connect** → Drivers → Copy connection string
6. Replace `<password>` with your DB user password

### Google Gemini API
1. Go to https://ai.google.dev
2. Click **Get API key in Google AI Studio**
3. Create a new API key
4. Copy the key

---

## Step 2 — Backend Setup

```bash
cd expense-tracker/backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

Edit `.env`:
```env
PORT=5000
MONGODB_URI=mongodb+srv://youruser:yourpassword@cluster0.xxxxx.mongodb.net/expense-tracker?retryWrites=true&w=majority
JWT_SECRET=change_this_to_a_long_random_string_at_least_32_chars
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=AIzaSy_your_actual_gemini_api_key_here
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

```bash
# Start backend in development
npm run dev

# You should see:
# ✅ Connected to MongoDB Atlas
# 🚀 Server running on port 5000
```

---

## Step 3 — Frontend Setup

```bash
cd expense-tracker/frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

Edit `.env`:
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_NAME=AI Expense Tracker
```

```bash
# Start frontend
npm start

# App opens at http://localhost:3000
```

---

## Step 4 — Test the App

1. Open http://localhost:3000
2. Register a new account
3. Go to **Dashboard** → See your overview
4. Go to **Add Entry** → Try AI Smart Entry:
   - Type: `"Spent 450 on pizza and coffee"`
   - Click **Analyze with Gemini AI**
   - Review extracted data → Save
5. Go to **AI Insights** → Generate spending analysis
6. Go to **Receipt Scan** → Upload a receipt image
7. Go to **Budget** → Set your monthly budget

---

## 📡 API Reference

### Auth Endpoints
| Method | URL | Description | Auth |
|--------|-----|-------------|------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login user | No |
| GET | `/api/auth/me` | Get current user | Yes |
| PUT | `/api/auth/profile` | Update profile | Yes |

### Transaction Endpoints
| Method | URL | Description | Auth |
|--------|-----|-------------|------|
| GET | `/api/transactions` | List transactions (paginated) | Yes |
| GET | `/api/transactions/summary` | Monthly summary | Yes |
| GET | `/api/transactions/trends` | 6-month trends | Yes |
| POST | `/api/transactions` | Create transaction | Yes |
| PUT | `/api/transactions/:id` | Update transaction | Yes |
| DELETE | `/api/transactions/:id` | Delete transaction | Yes |

### Budget Endpoints
| Method | URL | Description | Auth |
|--------|-----|-------------|------|
| GET | `/api/budgets` | Get budget settings | Yes |
| PUT | `/api/budgets` | Update budget | Yes |

### AI Endpoints
| Method | URL | Description | Auth |
|--------|-----|-------------|------|
| POST | `/api/ai/categorize` | AI categorize text | Yes |
| POST | `/api/ai/insights` | Generate insights | Yes |
| POST | `/api/ai/receipt` | Scan receipt image | Yes |
| POST | `/api/ai/budget-predict` | Budget prediction | Yes |

### Query Parameters (GET /api/transactions)
```
?type=expense|income
?category=Food|Travel|Shopping|Bills|Entertainment|Health|Other
?startDate=2024-01-01
?endDate=2024-12-31
?page=1
?limit=20
?sort=-date
```

---

## 🗄️ MongoDB Schema

### Users Collection
```json
{
  "_id": "ObjectId",
  "name": "string (required, 2-50 chars)",
  "email": "string (required, unique, lowercase)",
  "password": "string (hashed, select: false)",
  "currency": "string (default: INR)",
  "createdAt": "Date"
}
```

### Transactions Collection
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (ref: User)",
  "type": "income | expense",
  "amount": "number (> 0)",
  "category": "Food | Travel | Shopping | Bills | Entertainment | Health | Salary | Investment | Other",
  "description": "string (1-200 chars)",
  "notes": "string (optional, 0-500 chars)",
  "date": "Date",
  "aiGenerated": "boolean",
  "receiptImage": "string (optional)",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Budgets Collection
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (ref: User, unique)",
  "monthlyBudget": "number",
  "categoryBudgets": {
    "Food": "number",
    "Travel": "number",
    "Shopping": "number",
    "Bills": "number",
    "Entertainment": "number",
    "Health": "number",
    "Other": "number"
  },
  "alertThreshold": "number (1-100, default: 80)",
  "notifications": {
    "budgetAlert": "boolean",
    "weeklySummary": "boolean",
    "aiTips": "boolean"
  }
}
```

---

## 🤖 Gemini AI Prompts

### Expense Categorization
Input: `"Spent 450 on pizza and coffee"`

Prompt strategy:
- Instructs Gemini to return only valid JSON
- Extracts: amount, category, type (income/expense), description, confidence
- Uses strict category enum for consistent results

### Financial Insights
- Sends last 3 months of transaction data
- Compares this month vs last month per category
- Returns: summary, insights array, savings suggestions, budget recommendations, spending score (1-100), risk level

### Receipt Scanner
- Sends image as base64 inline data
- Extracts: total amount, category, description, date, individual items, merchant name
- Confidence score helps flag low-quality scans

### Budget Prediction
- Calculates daily spending rate from current month
- Projects end-of-month total
- AI generates contextual tips and risk assessment

---

## 🚢 Deployment Guide

### Backend → Render.com

1. Push backend to GitHub repo
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Node Version:** 18
5. Add Environment Variables:
   ```
   MONGODB_URI=your_atlas_uri
   JWT_SECRET=your_secret
   GEMINI_API_KEY=your_key
   NODE_ENV=production
   FRONTEND_URL=https://your-app.vercel.app
   ```
6. Deploy → Copy the service URL

---

### Frontend → Vercel

1. Push frontend to GitHub repo
2. Go to https://vercel.com → New Project
3. Import your GitHub repo
4. Settings:
   - **Root Directory:** `frontend`
   - **Framework:** Create React App
5. Add Environment Variables:
   ```
   REACT_APP_API_URL=https://your-backend.onrender.com/api
   ```
6. Deploy → Your app is live!

---

### Database → MongoDB Atlas (already cloud)

- Your Atlas cluster is already cloud-hosted
- Make sure Network Access allows connections from anywhere (0.0.0.0/0) for Render
- Or whitelist Render's static IP if on a paid Atlas plan

---

## 🔐 Security Checklist

- [x] Passwords hashed with bcrypt (12 rounds)
- [x] JWT tokens with expiry (7 days)
- [x] Auth middleware on all protected routes
- [x] Rate limiting (100 req/15min general, 20 req/min for AI)
- [x] Input validation with express-validator
- [x] CORS configured for specific frontend URL
- [x] File upload validation (type + size limits)
- [x] MongoDB injection prevention (Mongoose ODM)
- [x] User data isolation (userId filter on all queries)
- [ ] **Production:** Change JWT_SECRET to 64+ char random string
- [ ] **Production:** Set NODE_ENV=production
- [ ] **Production:** Restrict CORS to your Vercel URL only

---

## 🎨 UI Pages Overview

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | JWT login form |
| Register | `/register` | Account creation |
| Dashboard | `/dashboard` | Stats, charts, recent transactions |
| Transactions | `/transactions` | Paginated list with edit/delete |
| Add Entry | `/add` | Manual or AI-powered entry |
| Analytics | `/analytics` | Charts: bar, pie, line, area |
| AI Insights | `/insights` | Gemini financial analysis |
| Receipt Scan | `/receipt` | Image upload → AI extraction |
| Budget | `/budget` | Monthly budget + category limits |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6 |
| Styling | Tailwind CSS, custom animations |
| Charts | Recharts |
| Backend | Node.js, Express |
| Database | MongoDB Atlas, Mongoose |
| Auth | JWT, bcryptjs |
| AI | Google Gemini 1.5 Flash |
| File Upload | Multer |
| Validation | express-validator |
| Rate Limiting | express-rate-limit |
| Fonts | Sora (display), DM Sans (body), JetBrains Mono |

---

## 📦 Environment Variables Summary

### Backend (.env)
```env
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/expense-tracker
JWT_SECRET=your_64_char_random_secret
JWT_EXPIRES_IN=7d
GEMINI_API_KEY=AIzaSy_your_gemini_key
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_NAME=AI Expense Tracker
```

---

## 🐛 Troubleshooting

**MongoDB connection error:**
- Check your MONGODB_URI has correct username/password
- Ensure IP 0.0.0.0/0 is whitelisted in Atlas Network Access
- Check cluster is not paused (free tier pauses after 7 days of inactivity)

**Gemini AI errors:**
- Verify GEMINI_API_KEY is correct in backend .env
- Check you haven't exceeded free tier limits (60 requests/minute)
- AI endpoints have rate limiting (20 req/min) built-in

**Receipt scan not working:**
- Ensure image is under 5MB
- Supported formats: JPG, PNG, WebP, PDF
- Make sure the `uploads/` folder exists in backend (auto-created on first scan)

**CORS errors:**
- Set FRONTEND_URL in backend .env to your frontend URL
- In production, update this to your Vercel URL

**JWT expired:**
- Tokens expire after 7 days — just log in again
- Adjust JWT_EXPIRES_IN in .env if needed

---

## 📄 License

MIT License — Use freely for personal and commercial projects.
