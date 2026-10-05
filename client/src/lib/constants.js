import {
  Car,
  Circle,
  Clapperboard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Plane,
  Repeat,
  Scissors,
  ShoppingBag,
  ShoppingBasket,
  TrendingUp,
  Utensils,
  Zap,
  Wallet,
} from 'lucide-react';

// Categories get an icon, not a color: 15 categories can't each have a
// distinguishable hue, so color stays reserved for data and status.
export const CATEGORY_ICONS = {
  'Food & Dining': Utensils,
  Groceries: ShoppingBasket,
  Transport: Car,
  Shopping: ShoppingBag,
  'Bills & Utilities': Zap,
  'Rent & Housing': House,
  Entertainment: Clapperboard,
  Health: HeartPulse,
  Education: GraduationCap,
  Travel: Plane,
  Subscriptions: Repeat,
  'Personal Care': Scissors,
  'Gifts & Donations': Gift,
  Investments: TrendingUp,
  Other: Circle,
  Overall: Wallet,
};

export const CATEGORIES = Object.keys(CATEGORY_ICONS).filter((c) => c !== 'Overall');
export const PAYMENT_METHODS = ['UPI', 'Card', 'Cash', 'Net Banking', 'Wallet', 'Other'];
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

export const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];
