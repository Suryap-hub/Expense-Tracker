import React, { useState, useEffect } from 'react';
import { budgetAPI } from '../utils/api';
import toast from 'react-hot-toast';

const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];
const CAT_ICONS = { Food: '🍕', Travel: '✈️', Shopping: '🛍️', Bills: '📄', Entertainment: '🎬', Health: '💊', Other: '📦' };

export default function BudgetSettings() {
  const [budget, setBudget] = useState(null);
  const [form, setForm] = useState({ monthlyBudget: '', alertThreshold: 80, categoryBudgets: {}, notifications: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    budgetAPI.get().then(res => {
      const b = res.data.budget;
      setBudget(b);
      setForm({
        monthlyBudget: b.monthlyBudget || '',
        alertThreshold: b.alertThreshold || 80,
        categoryBudgets: b.categoryBudgets || {},
        notifications: b.notifications || {}
      });
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.monthlyBudget || parseFloat(form.monthlyBudget) <= 0) {
      return toast.error('Please enter a valid monthly budget');
    }
    setSaving(true);
    try {
      await budgetAPI.update({ ...form, monthlyBudget: parseFloat(form.monthlyBudget) });
      toast.success('Budget settings saved!');
    } catch {
      toast.error('Failed to save budget');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Budget Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Set your monthly budget and category limits</p>
      </div>

      {/* Monthly budget */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-display font-semibold text-white flex items-center gap-2"><span>🎯</span> Monthly Budget</h3>
        <div>
          <label className="text-sm text-slate-300 block mb-2">Total Monthly Budget (₹)</label>
          <input
            type="number"
            min="1"
            value={form.monthlyBudget}
            onChange={e => setForm(f => ({ ...f, monthlyBudget: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono text-lg"
            placeholder="50000"
          />
        </div>
        <div>
          <label className="text-sm text-slate-300 block mb-2">Alert Threshold: {form.alertThreshold}%</label>
          <input
            type="range"
            min="10"
            max="100"
            value={form.alertThreshold}
            onChange={e => setForm(f => ({ ...f, alertThreshold: parseInt(e.target.value) }))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>10%</span>
            <span className="text-emerald-400">Alert at {form.alertThreshold}% usage</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Category budgets */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-display font-semibold text-white flex items-center gap-2"><span>📊</span> Category Budgets</h3>
        <p className="text-slate-400 text-xs">Set optional spending limits per category</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {CATEGORIES.map(cat => (
            <div key={cat} className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-3 py-2">
              <span className="text-xl flex-shrink-0">{CAT_ICONS[cat]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-slate-300 text-xs font-medium">{cat}</p>
                <input
                  type="number"
                  min="0"
                  value={form.categoryBudgets[cat] || ''}
                  onChange={e => setForm(f => ({ ...f, categoryBudgets: { ...f.categoryBudgets, [cat]: e.target.value ? parseFloat(e.target.value) : 0 } }))}
                  className="w-full bg-transparent text-white text-sm font-mono focus:outline-none placeholder-slate-600"
                  placeholder="No limit"
                />
              </div>
              <span className="text-slate-600 text-xs flex-shrink-0">₹</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-display font-semibold text-white flex items-center gap-2"><span>🔔</span> Notifications</h3>
        {[
          { key: 'budgetAlert', label: 'Budget Exceeded Alerts', desc: 'Get notified when you exceed your budget threshold' },
          { key: 'weeklySummary', label: 'Weekly Summary', desc: 'Receive a weekly digest of your spending' },
          { key: 'aiTips', label: 'AI Tips', desc: 'Get smart financial tips from Gemini AI' },
        ].map(n => (
          <div key={n.key} className="flex items-center justify-between py-2">
            <div>
              <p className="text-slate-200 text-sm font-medium">{n.label}</p>
              <p className="text-slate-500 text-xs">{n.desc}</p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, notifications: { ...f.notifications, [n.key]: !f.notifications[n.key] } }))}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${form.notifications[n.key] !== false ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${form.notifications[n.key] !== false ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
      </div>

      {/* Budget summary preview */}
      {form.monthlyBudget && (
        <div className="bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border border-emerald-500/20 rounded-2xl p-5">
          <h3 className="font-medium text-emerald-300 mb-3">Budget Summary Preview</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-400">Monthly Budget</p>
              <p className="text-white font-mono font-semibold">₹{parseFloat(form.monthlyBudget || 0).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-slate-400">Alert at</p>
              <p className="text-white font-mono font-semibold">₹{(parseFloat(form.monthlyBudget || 0) * form.alertThreshold / 100).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-slate-400">Daily target</p>
              <p className="text-white font-mono font-semibold">₹{(parseFloat(form.monthlyBudget || 0) / 30).toFixed(0)}</p>
            </div>
            <div>
              <p className="text-slate-400">Category limits set</p>
              <p className="text-white font-mono font-semibold">{Object.values(form.categoryBudgets).filter(v => v > 0).length}/{CATEGORIES.length}</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Saving...
          </span>
        ) : '✓ Save Budget Settings'}
      </button>
    </div>
  );
}
