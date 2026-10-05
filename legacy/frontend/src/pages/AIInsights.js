import React, { useState } from 'react';
import { aiAPI } from '../utils/api';
import toast from 'react-hot-toast';

function ScoreRing({ score }) {
  const r = 40, cx = 56, cy = 56;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center">
      <svg width="112" height="112" className="rotate-[-90deg]">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="text-center -mt-20">
        <p className="font-display text-4xl font-bold" style={{ color }}>{score}</p>
        <p className="text-slate-400 text-xs mt-1">Financial Score</p>
      </div>
    </div>
  );
}

export default function AIInsights() {
  const [insights, setInsights] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [predLoading, setPredLoading] = useState(false);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const res = await aiAPI.getInsights();
      setInsights(res.data.insights);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  const loadPrediction = async () => {
    setPredLoading(true);
    try {
      const res = await aiAPI.predictBudget();
      setPrediction(res.data.prediction);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Prediction requires budget to be set');
    } finally {
      setPredLoading(false);
    }
  };

  const riskColor = {
    low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    high: 'text-red-400 bg-red-500/10 border-red-500/30'
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <span className="text-2xl">✦</span> AI Financial Insights
        </h1>
        <p className="text-slate-400 text-sm mt-1">Powered by Google Gemini — personalized analysis of your spending habits</p>
      </div>

      {/* Generate buttons */}
      <div className="grid sm:grid-cols-2 gap-4">
        <button
          onClick={loadInsights}
          disabled={loading}
          className="bg-gradient-to-br from-violet-600/30 to-purple-700/30 border border-violet-500/30 hover:border-violet-400/50 rounded-2xl p-5 text-left transition-all group disabled:opacity-60"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🧠</span>
            <h3 className="font-display font-semibold text-white">Spending Analysis</h3>
          </div>
          <p className="text-slate-400 text-sm">Get AI-powered insights on spending patterns, savings suggestions, and financial health score.</p>
          <div className="mt-3 text-violet-400 text-sm font-medium group-hover:text-violet-300 transition-colors">
            {loading ? '⏳ Analyzing...' : '→ Generate Insights'}
          </div>
        </button>

        <button
          onClick={loadPrediction}
          disabled={predLoading}
          className="bg-gradient-to-br from-amber-600/20 to-orange-700/20 border border-amber-500/30 hover:border-amber-400/50 rounded-2xl p-5 text-left transition-all group disabled:opacity-60"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🔮</span>
            <h3 className="font-display font-semibold text-white">Budget Prediction</h3>
          </div>
          <p className="text-slate-400 text-sm">AI predicts whether you'll overspend this month based on your current rate.</p>
          <div className="mt-3 text-amber-400 text-sm font-medium group-hover:text-amber-300 transition-colors">
            {predLoading ? '⏳ Predicting...' : '→ Predict Spending'}
          </div>
        </button>
      </div>

      {/* Loading state */}
      {(loading || predLoading) && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Gemini AI is analyzing your financial data...</p>
        </div>
      )}

      {/* Insights result */}
      {insights && !loading && (
        <div className="space-y-5 animate-slide-up">
          {/* Header with score */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-6 flex-wrap">
              <ScoreRing score={insights.spendingScore || 65} />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h3 className="font-display font-bold text-white text-lg">Financial Health</h3>
                  <span className={`text-xs px-3 py-1 rounded-full border font-medium ${riskColor[insights.riskLevel] || riskColor.medium}`}>
                    {(insights.riskLevel || 'medium').toUpperCase()} RISK
                  </span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{insights.summary}</p>
                <div className="flex gap-4 mt-3 flex-wrap">
                  <div>
                    <p className="text-xs text-slate-500">Top Category</p>
                    <p className="text-sm font-medium text-white">{insights.topSpendingCategory || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">vs Last Month</p>
                    <p className={`text-sm font-medium ${(insights.monthlyChangePercent || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {(insights.monthlyChangePercent || 0) > 0 ? '↑' : '↓'} {Math.abs(insights.monthlyChangePercent || 0).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Insights */}
          {insights.insights?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="font-display font-semibold text-white mb-4 flex items-center gap-2"><span>💡</span> Key Insights</h3>
              <div className="space-y-3">
                {insights.insights.map((ins, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-slate-800/50 rounded-xl">
                    <span className="text-violet-400 mt-0.5 flex-shrink-0">◆</span>
                    <p className="text-slate-300 text-sm">{ins}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Savings suggestions */}
          {insights.savingsSuggestions?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="font-display font-semibold text-white mb-4 flex items-center gap-2"><span>💰</span> Savings Suggestions</h3>
              <div className="space-y-3">
                {insights.savingsSuggestions.map((tip, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                    <span className="text-emerald-400 flex-shrink-0">✓</span>
                    <p className="text-slate-300 text-sm">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget recommendations */}
          {insights.budgetRecommendations?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="font-display font-semibold text-white mb-4 flex items-center gap-2"><span>🎯</span> Budget Recommendations</h3>
              <div className="space-y-3">
                {insights.budgetRecommendations.map((rec, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                    <span className="text-blue-400 flex-shrink-0">→</span>
                    <p className="text-slate-300 text-sm">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unnecessary expenses */}
          {insights.unnecessaryExpenses?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="font-display font-semibold text-white mb-4 flex items-center gap-2"><span>⚠️</span> Areas to Review</h3>
              <div className="space-y-3">
                {insights.unnecessaryExpenses.map((exp, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                    <span className="text-red-400 flex-shrink-0">!</span>
                    <p className="text-slate-300 text-sm">{exp}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Budget prediction result */}
      {prediction && !predLoading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 animate-slide-up">
          <h3 className="font-display font-semibold text-white flex items-center gap-2"><span>🔮</span> Budget Prediction</h3>
          
          <div className={`p-4 rounded-xl border ${prediction.willOverBudget ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
            <p className={`font-medium ${prediction.willOverBudget ? 'text-red-400' : 'text-emerald-400'}`}>
              {prediction.willOverBudget ? '⚠️ At risk of exceeding budget' : '✓ On track to stay within budget'}
            </p>
            <p className="text-slate-300 text-sm mt-1">{prediction.prediction}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Budget', value: `₹${(prediction.budget || 0).toLocaleString('en-IN')}` },
              { label: 'Spent So Far', value: `₹${(prediction.spent || 0).toLocaleString('en-IN')}` },
              { label: 'Projected Total', value: `₹${(prediction.projectedTotal || 0).toLocaleString('en-IN')}` },
              { label: 'Budget Used', value: `${prediction.budgetUsedPercent}%` },
            ].map(s => (
              <div key={s.label} className="bg-slate-800 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-white font-mono font-semibold text-sm mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {prediction.tips?.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-300">AI Tips:</p>
              {prediction.tips.map((tip, i) => (
                <div key={i} className="flex gap-2 text-sm text-slate-400">
                  <span className="text-amber-400">→</span> {tip}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!insights && !prediction && !loading && !predLoading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">✦</div>
          <h3 className="font-display font-semibold text-white mb-2">Unlock AI Insights</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Click one of the buttons above to generate personalized financial insights powered by Google Gemini AI.</p>
        </div>
      )}
    </div>
  );
}
