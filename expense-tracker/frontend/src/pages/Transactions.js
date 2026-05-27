import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { transactionAPI } from '../utils/api';
import toast from 'react-hot-toast';

const CATEGORY_ICONS = {
  Food: '🍕', Travel: '✈️', Shopping: '🛍️', Bills: '📄',
  Entertainment: '🎬', Health: '💊', Salary: '💼', Investment: '📈', Other: '📦'
};
const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Salary', 'Investment', 'Other'];

function EditModal({ t, onClose, onSave }) {
  const [form, setForm] = useState({
    amount: t.amount,
    category: t.category,
    description: t.description,
    notes: t.notes || '',
    date: new Date(t.date).toISOString().split('T')[0],
    type: t.type
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await transactionAPI.update(t._id, { ...form, amount: parseFloat(form.amount) });
      toast.success('Updated!');
      onSave();
    } catch {
      toast.error('Failed to update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white">Edit Transaction</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            {['expense', 'income'].map(tp => (
              <button key={tp} type="button" onClick={() => setForm(f => ({ ...f, type: tp }))}
                className={`flex-1 py-2 rounded-xl text-sm capitalize transition-all ${form.type === tp ? (tp === 'expense' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30') : 'bg-slate-800 text-slate-400'}`}>
                {tp}
              </button>
            ))}
          </div>
          <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500" placeholder="Amount" />
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500" placeholder="Description" />
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-all">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm transition-all disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editT, setEditT] = useState(null);
  const [filter, setFilter] = useState({ type: '', category: '' });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15, sort: '-date' };
      if (filter.type) params.type = filter.type;
      if (filter.category) params.category = filter.category;
      const res = await transactionAPI.getAll(params);
      setTransactions(res.data.transactions);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await transactionAPI.delete(id);
      toast.success('Deleted!');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {editT && <EditModal t={editT} onClose={() => setEditT(null)} onSave={() => { setEditT(null); load(); }} />}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Transactions</h1>
          <p className="text-slate-400 text-sm mt-1">{pagination.total || 0} total transactions</p>
        </div>
        <Link to="/add" className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-lg shadow-emerald-500/20">
          + Add Entry
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={filter.type} onChange={e => { setFilter(f => ({ ...f, type: e.target.value })); setPage(1); }}
          className="bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
          <option value="">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select value={filter.category} onChange={e => { setFilter(f => ({ ...f, category: e.target.value })); setPage(1); }}
          className="bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filter.type || filter.category) && (
          <button onClick={() => { setFilter({ type: '', category: '' }); setPage(1); }}
            className="px-3 py-2 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all">
            Clear Filters
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-slate-400 font-medium">No transactions found</p>
            <Link to="/add" className="text-emerald-400 text-sm hover:text-emerald-300 mt-2 inline-block">+ Add your first entry</Link>
          </div>
        ) : (
          <div>
            {transactions.map((t, i) => {
              const date = new Date(t.date);
              return (
                <div key={t._id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors group">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl flex-shrink-0">
                    {CATEGORY_ICONS[t.category] || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium truncate">{t.description}</p>
                      {t.aiGenerated && <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full flex-shrink-0">AI</span>}
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {t.category} · {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <p className={`font-mono font-semibold text-sm flex-shrink-0 ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.type === 'income' ? '+' : '-'}₹{t.amount.toLocaleString('en-IN')}
                  </p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setEditT(t)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all text-sm">✏</button>
                    <button onClick={() => handleDelete(t._id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all text-sm">🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 bg-slate-900 border border-slate-700 text-slate-300 rounded-xl text-sm hover:bg-slate-800 disabled:opacity-40 transition-all">
            ← Prev
          </button>
          <span className="text-slate-400 text-sm">Page {page} of {pagination.pages}</span>
          <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}
            className="px-4 py-2 bg-slate-900 border border-slate-700 text-slate-300 rounded-xl text-sm hover:bg-slate-800 disabled:opacity-40 transition-all">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
