import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactionAPI, aiAPI } from '../utils/api';
import toast from 'react-hot-toast';

const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Salary', 'Investment', 'Other'];
const CATEGORY_ICONS = {
  Food: '🍕', Travel: '✈️', Shopping: '🛍️', Bills: '📄',
  Entertainment: '🎬', Health: '💊', Salary: '💼', Investment: '📈', Other: '📦'
};

export default function AddTransaction() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('manual'); // 'manual' | 'ai'
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    category: 'Food',
    description: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleAICategorize = async () => {
    if (!aiText.trim()) return toast.error('Please enter a description');
    setAiLoading(true);
    try {
      const res = await aiAPI.categorize(aiText);
      const { amount, category, type, description } = res.data.result;
      setForm(f => ({
        ...f,
        amount: amount || f.amount,
        category: category || f.category,
        type: type || f.type,
        description: description || aiText
      }));
      toast.success(`AI detected: ${category} · ₹${amount}`);
      setMode('manual');
    } catch (err) {
      toast.error(err.response?.data?.error || 'AI categorization failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    setLoading(true);
    try {
      await transactionAPI.create({
        ...form,
        amount: parseFloat(form.amount),
        aiGenerated: mode === 'ai'
      });
      toast.success('Transaction added!');
      navigate('/transactions');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Add Transaction</h1>
        <p className="text-slate-400 text-sm mt-1">Record income or expense manually or with AI</p>
      </div>

      {/* Mode toggle */}
      <div className="flex bg-slate-900 border border-slate-800 rounded-2xl p-1 gap-1">
        {[
          { id: 'manual', icon: '✏️', label: 'Manual Entry' },
          { id: 'ai', icon: '✦', label: 'AI Smart Entry' }
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
              mode === m.id
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      {/* AI input section */}
      {mode === 'ai' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">✦</span>
            <h3 className="font-display font-semibold text-white">Describe your expense</h3>
          </div>
          <p className="text-slate-400 text-sm">Type naturally — AI will extract amount, category, and description automatically.</p>
          <div className="space-y-2">
            <textarea
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              rows={3}
              placeholder="e.g. 'Spent 450 on pizza and coffee' or 'Paid 1200 for electricity bill'"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {['Spent 450 on pizza', 'Received salary 50000', 'Paid 800 for Uber to airport', 'Netflix subscription 649'].map(ex => (
                <button
                  key={ex}
                  onClick={() => setAiText(ex)}
                  className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleAICategorize}
            disabled={aiLoading || !aiText.trim()}
            className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {aiLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing with AI...
              </span>
            ) : '✦ Analyze with Gemini AI'}
          </button>
        </div>
      )}

      {/* Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="font-display font-semibold text-white mb-5">
          {mode === 'ai' ? 'Review & Confirm' : 'Transaction Details'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Type</label>
            <div className="flex gap-2">
              {['expense', 'income'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${
                    form.type === t
                      ? t === 'expense'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'expense' ? '💸' : '💰'} {t}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
              placeholder="0.00"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, category: cat }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                    form.category === cat
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span>{CATEGORY_ICONS[cat]}</span>
                  <span className="truncate">{cat}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
            <input
              type="text"
              required
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
              placeholder="What was this for?"
              maxLength={200}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes <span className="text-slate-500">(optional)</span></label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-none"
              placeholder="Additional notes..."
              maxLength={500}
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Date</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-medium transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </span>
              ) : '✓ Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
