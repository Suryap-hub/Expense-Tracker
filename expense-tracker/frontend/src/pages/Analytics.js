import React, { useState, useEffect } from 'react';
import { transactionAPI } from '../utils/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid
} from 'recharts';

const COLORS = {
  Food: '#f59e0b', Travel: '#3b82f6', Shopping: '#ec4899',
  Bills: '#ef4444', Entertainment: '#8b5cf6', Health: '#10b981',
  Other: '#6b7280', Salary: '#22c55e', Investment: '#06b6d4'
};

export default function Analytics() {
  const [trends, setTrends] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [trendsRes, summaryRes] = await Promise.all([
          transactionAPI.getTrends(),
          transactionAPI.getSummary({ month: selectedMonth, year: selectedYear })
        ]);
        setTrends(trendsRes.data.trends);
        setSummary(summaryRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedMonth, selectedYear]);

  const pieData = summary ? Object.entries(summary.byCategory || {}).map(([name, value]) => ({ name, value })) : [];
  const fmt = n => `₹${(n || 0).toLocaleString('en-IN')}`;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Analytics</h1>
          <p className="text-slate-400 text-sm mt-1">Visual breakdown of your finances</p>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(parseInt(e.target.value))}
          className="bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        >
          {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Income', value: fmt(summary?.totalIncome), color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Expenses', value: fmt(summary?.totalExpenses), color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Balance', value: fmt(summary?.balance), color: summary?.balance >= 0 ? 'text-emerald-400' : 'text-red-400', bg: 'bg-blue-500/10' },
          { label: 'Transactions', value: summary?.transactionCount || 0, color: 'text-violet-400', bg: 'bg-violet-500/10' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border border-slate-800 rounded-2xl p-4`}>
            <p className="text-slate-400 text-xs font-medium">{s.label}</p>
            <p className={`font-display font-bold text-lg mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* 6-month trend bar chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="font-display font-semibold text-white mb-5">Income vs Expenses (6 months)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={trends} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }}
              formatter={v => [`₹${v.toLocaleString('en-IN')}`, '']}
            />
            <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
            <Bar dataKey="income" fill="#22c55e" radius={[6, 6, 0, 0]} name="Income" />
            <Bar dataKey="expenses" fill="#ef4444" radius={[6, 6, 0, 0]} name="Expenses" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie chart + Category breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="font-display font-semibold text-white mb-4">Category Distribution</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={3}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }}
                  formatter={v => [`₹${v.toLocaleString('en-IN')}`, '']}
                />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-slate-500">No expenses this month</div>
          )}
        </div>

        {/* Category table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="font-display font-semibold text-white mb-4">Category Breakdown</h3>
          {pieData.length > 0 ? (
            <div className="space-y-3">
              {pieData
                .sort((a, b) => b.value - a.value)
                .map(d => {
                  const pct = summary?.totalExpenses ? ((d.value / summary.totalExpenses) * 100).toFixed(1) : 0;
                  return (
                    <div key={d.name}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-300 text-sm">{d.name}</span>
                        <div className="text-right">
                          <span className="text-white text-sm font-mono">₹{d.value.toLocaleString('en-IN')}</span>
                          <span className="text-slate-500 text-xs ml-2">{pct}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: COLORS[d.name] || '#6b7280' }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-slate-500">No data available</div>
          )}
        </div>
      </div>

      {/* Net balance line chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="font-display font-semibold text-white mb-5">Net Savings Trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trends.map(t => ({ ...t, net: t.income - t.expenses }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f1f5f9' }}
              formatter={v => [`₹${v.toLocaleString('en-IN')}`, 'Net Savings']}
            />
            <Line type="monotone" dataKey="net" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 4 }} name="Net" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
