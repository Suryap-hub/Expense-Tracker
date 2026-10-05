import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { transactionAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

const CATEGORY_COLORS = {
  Food: '#f59e0b',
  Travel: '#3b82f6',
  Shopping: '#ec4899',
  Bills: '#ef4444',
  Entertainment: '#8b5cf6',
  Health: '#10b981',
  Other: '#6b7280',
  Salary: '#22c55e',
  Investment: '#06b6d4',
};

const CATEGORY_ICONS = {
  Food: '🍕', Travel: '✈️', Shopping: '🛍️', Bills: '📄',
  Entertainment: '🎬', Health: '💊', Salary: '💼', Investment: '📈', Other: '📦'
};

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all`}>
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10 ${color}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{label}</p>
          <p className="text-2xl font-display font-bold text-white mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

function RecentTransaction({ t }) {
  const date = new Date(t.date);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-800/50 last:border-0">
      <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-lg flex-shrink-0">
        {CATEGORY_ICONS[t.category] || '📦'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{t.description}</p>
        <p className="text-slate-500 text-xs">{t.category} · {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
      </div>
      <p className={`font-mono font-semibold text-sm flex-shrink-0 ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
        {t.type === 'income' ? '+' : '-'}₹{t.amount.toLocaleString('en-IN')}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [summaryRes, recentRes, trendsRes] = await Promise.all([
          transactionAPI.getSummary(),
          transactionAPI.getAll({ limit: 8, sort: '-date' }),
          transactionAPI.getTrends()
        ]);
        setSummary(summaryRes.data);
        setRecent(recentRes.data.transactions);
        setTrends(trendsRes.data.trends);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const pieData = summary ? Object.entries(summary.byCategory || {}).map(([name, value]) => ({ name, value })) : [];
  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-1">Here's your financial overview for {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
        </div>
        <Link
          to="/add"
          className="hidden sm:flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-lg shadow-emerald-500/20"
        >
          + Add Entry
        </Link>
      </div>

      {/* Budget alert */}
      {summary?.budgetAlert && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-red-400 font-medium text-sm">Budget Alert!</p>
            <p className="text-red-300/70 text-xs">You've used {summary.budgetUsed?.toFixed(1)}% of your monthly budget. Consider cutting back on expenses.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Income" value={fmt(summary?.totalIncome)} icon="💰" color="bg-emerald-500" />
        <StatCard label="Total Expenses" value={fmt(summary?.totalExpenses)} icon="💸" color="bg-red-500" />
        <StatCard label="Net Balance" value={fmt(summary?.balance)} sub={summary?.balance >= 0 ? 'Positive balance' : 'Negative balance'} icon="⚖️" color="bg-blue-500" />
        <StatCard label="Budget Used" value={`${summary?.budgetUsed?.toFixed(0) || 0}%`} sub={`of ${fmt(summary?.monthlyBudget)}`} icon="🎯" color="bg-violet-500" />
      </div>

      {/* Budget progress */}
      {summary?.monthlyBudget && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-slate-300 font-medium text-sm">Monthly Budget Progress</p>
            <p className="text-slate-400 text-xs">{fmt(summary.totalExpenses)} / {fmt(summary.monthlyBudget)}</p>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-700 ${
                (summary.budgetUsed || 0) > 90 ? 'bg-red-500' :
                (summary.budgetUsed || 0) > 70 ? 'bg-amber-500' :
                'bg-gradient-to-r from-emerald-500 to-teal-500'
              }`}
              style={{ width: `${Math.min(summary.budgetUsed || 0, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {fmt(Math.max(0, (summary.monthlyBudget || 0) - (summary.totalExpenses || 0)))} remaining this month
          </p>
        </div>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Trend chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="font-display font-semibold text-white mb-4">6-Month Trend</h3>
          {trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }}
                  formatter={v => [`₹${v.toLocaleString('en-IN')}`, '']}
                />
                <Area type="monotone" dataKey="income" stroke="#22c55e" fill="url(#incomeGrad)" strokeWidth={2} name="Income" />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#expenseGrad)" strokeWidth={2} name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No data yet</div>
          )}
        </div>

        {/* Pie chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="font-display font-semibold text-white mb-4">Expenses by Category</h3>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[entry.name] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }}
                    formatter={v => [`₹${v.toLocaleString('en-IN')}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 min-w-0">
                {pieData.slice(0, 6).map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[d.name] }} />
                    <span className="text-slate-400 text-xs truncate">{d.name}</span>
                    <span className="text-white text-xs font-mono ml-auto flex-shrink-0">₹{(d.value/1000).toFixed(1)}k</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No expenses this month</div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-white">Recent Transactions</h3>
          <Link to="/transactions" className="text-emerald-400 hover:text-emerald-300 text-sm transition-colors">View all →</Link>
        </div>
        {recent.length > 0 ? (
          <div>{recent.map(t => <RecentTransaction key={t._id} t={t} />)}</div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-slate-500 text-sm">No transactions yet</p>
            <Link to="/add" className="text-emerald-400 text-sm hover:text-emerald-300 mt-2 inline-block">+ Add your first entry</Link>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/add', icon: '➕', label: 'Add Entry', color: 'from-emerald-600/20 to-teal-600/20 border-emerald-500/20' },
          { to: '/receipt', icon: '📷', label: 'Scan Receipt', color: 'from-blue-600/20 to-indigo-600/20 border-blue-500/20' },
          { to: '/insights', icon: '✦', label: 'AI Insights', color: 'from-violet-600/20 to-purple-600/20 border-violet-500/20' },
          { to: '/budget', icon: '🎯', label: 'Set Budget', color: 'from-amber-600/20 to-orange-600/20 border-amber-500/20' },
        ].map(a => (
          <Link
            key={a.to}
            to={a.to}
            className={`bg-gradient-to-br ${a.color} border rounded-xl p-4 text-center hover:scale-105 transition-transform duration-200`}
          >
            <div className="text-2xl mb-1">{a.icon}</div>
            <p className="text-white text-xs font-medium">{a.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
