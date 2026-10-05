export const CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Transport',
  'Shopping',
  'Bills & Utilities',
  'Rent & Housing',
  'Entertainment',
  'Health',
  'Education',
  'Travel',
  'Subscriptions',
  'Personal Care',
  'Gifts & Donations',
  'Investments',
  'Other',
];

// "Overall" is a budget-only pseudo category covering all spending.
export const OVERALL = 'Overall';
export const BUDGET_CATEGORIES = [OVERALL, ...CATEGORIES];

export const PAYMENT_METHODS = ['UPI', 'Card', 'Cash', 'Net Banking', 'Wallet', 'Other'];

// Instant, offline keyword categorizer. Used when the user doesn't pick a
// category and as a fallback when the AI is unavailable.
const RULES = [
  ['Food & Dining', ['swiggy', 'zomato', 'restaurant', 'cafe', 'coffee', 'starbucks', 'dominos', 'pizza', 'burger', 'kfc', 'mcdonald', 'lunch', 'dinner', 'breakfast', 'food', 'chai', 'tea', 'canteen', 'mess', 'biryani', 'snack', 'eat']],
  ['Groceries', ['blinkit', 'zepto', 'bigbasket', 'instamart', 'grocery', 'groceries', 'dmart', 'vegetable', 'fruits', 'milk', 'kirana', 'supermarket', 'jiomart']],
  ['Transport', ['uber', 'ola', 'rapido', 'metro', 'petrol', 'diesel', 'fuel', 'auto', 'cab', 'taxi', 'bus', 'parking', 'toll', 'fastag', 'irctc local']],
  ['Shopping', ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'shopping', 'clothes', 'shoes', 'electronics', 'mall']],
  ['Bills & Utilities', ['electricity', 'water bill', 'gas', 'recharge', 'mobile', 'airtel', 'jio', 'vodafone', 'vi ', 'broadband', 'wifi', 'internet', 'bill', 'dth', 'bescom', 'bses']],
  ['Rent & Housing', ['rent', 'pg ', 'hostel', 'maintenance', 'society', 'landlord', 'deposit']],
  ['Entertainment', ['movie', 'pvr', 'inox', 'bookmyshow', 'concert', 'game', 'gaming', 'steam', 'party', 'club']],
  ['Health', ['pharmacy', 'medicine', 'doctor', 'hospital', 'clinic', 'apollo', 'pharmeasy', '1mg', 'netmeds', 'gym', 'lab test', 'dental']],
  ['Education', ['course', 'udemy', 'coursera', 'book', 'books', 'tuition', 'fees', 'college', 'exam', 'stationery', 'leetcode']],
  ['Travel', ['flight', 'indigo', 'air india', 'vistara', 'hotel', 'oyo', 'airbnb', 'makemytrip', 'goibibo', 'train', 'irctc', 'trip', 'booking.com']],
  ['Subscriptions', ['netflix', 'spotify', 'prime', 'hotstar', 'youtube premium', 'subscription', 'chatgpt', 'claude', 'icloud', 'google one', 'github', 'notion']],
  ['Personal Care', ['salon', 'haircut', 'spa', 'barber', 'cosmetics', 'grooming', 'urban company']],
  ['Gifts & Donations', ['gift', 'donation', 'charity', 'temple', 'birthday', 'wedding']],
  ['Investments', ['sip', 'mutual fund', 'zerodha', 'groww', 'stocks', 'shares', 'upstox', 'fd ', 'fixed deposit', 'ppf', 'nps']],
];

export function guessCategory(...texts) {
  const hay = ` ${texts.filter(Boolean).join(' ').toLowerCase()} `;
  for (const [category, words] of RULES) {
    if (words.some((w) => hay.includes(w))) return category;
  }
  return null;
}
