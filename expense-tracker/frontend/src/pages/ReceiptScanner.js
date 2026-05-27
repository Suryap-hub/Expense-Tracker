import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiAPI, transactionAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function ReceiptScanner() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const navigate = useNavigate();

  const handleFile = (f) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error('File size must be under 5MB'); return; }
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const scanReceipt = async () => {
    if (!file) return;
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append('receipt', file);
      const res = await aiAPI.scanReceipt(formData);
      setResult(res.data.result);
      toast.success('Receipt scanned successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to scan receipt');
    } finally {
      setScanning(false);
    }
  };

  const saveTransaction = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await transactionAPI.create({
        type: 'expense',
        amount: result.amount,
        category: result.category,
        description: result.description,
        date: result.date || new Date().toISOString().split('T')[0],
        notes: result.merchant ? `Merchant: ${result.merchant}` : '',
        aiGenerated: true
      });
      toast.success('Transaction saved from receipt!');
      navigate('/transactions');
    } catch (err) {
      toast.error('Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  const CATEGORY_ICONS = { Food: '🍕', Travel: '✈️', Shopping: '🛍️', Bills: '📄', Entertainment: '🎬', Health: '💊', Other: '📦' };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <span>📷</span> Receipt Scanner
        </h1>
        <p className="text-slate-400 text-sm mt-1">Upload a receipt image — Gemini AI will extract transaction details automatically</p>
      </div>

      {/* Upload area */}
      <div
        className="bg-slate-900 border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-2xl p-8 text-center cursor-pointer transition-all"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          onChange={e => handleFile(e.target.files[0])}
          className="hidden"
        />
        {preview ? (
          <div className="space-y-3">
            <img src={preview} alt="Receipt" className="max-h-64 mx-auto rounded-xl object-contain" />
            <p className="text-emerald-400 text-sm">{file?.name}</p>
            <p className="text-slate-500 text-xs">Click to change file</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-5xl">📄</div>
            <div>
              <p className="text-white font-medium">Drop receipt here or click to upload</p>
              <p className="text-slate-400 text-sm mt-1">Supports JPG, PNG, WebP, PDF — Max 5MB</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center text-xs text-slate-500">
              <span className="bg-slate-800 px-3 py-1 rounded-full">Restaurant bills</span>
              <span className="bg-slate-800 px-3 py-1 rounded-full">Shopping receipts</span>
              <span className="bg-slate-800 px-3 py-1 rounded-full">Utility bills</span>
              <span className="bg-slate-800 px-3 py-1 rounded-full">Medical receipts</span>
            </div>
          </div>
        )}
      </div>

      {/* Scan button */}
      {file && !result && (
        <button
          onClick={scanReceipt}
          disabled={scanning}
          className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-violet-500/20"
        >
          {scanning ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Gemini AI is reading your receipt...
            </span>
          ) : '✦ Scan with Gemini AI'}
        </button>
      )}

      {/* Scanning animation */}
      {scanning && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="w-16 h-16 border-4 border-violet-500/30 rounded-full" />
            <div className="absolute inset-0 w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-3 w-10 h-10 border-4 border-purple-400/50 border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
          </div>
          <div>
            <p className="text-white font-medium">Processing receipt...</p>
            <p className="text-slate-400 text-sm mt-1">Gemini AI is extracting amount, merchant, and category</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 space-y-5 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              <span className="text-xl">✓</span>
            </div>
            <div>
              <h3 className="font-display font-semibold text-white">Receipt Scanned Successfully</h3>
              <p className="text-slate-400 text-xs">Confidence: {result.confidence}% · AI Generated</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-xl p-3">
              <p className="text-xs text-slate-400">Amount</p>
              <p className="text-white font-mono font-bold text-lg mt-1">₹{result.amount.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-3">
              <p className="text-xs text-slate-400">Category</p>
              <p className="text-white font-medium mt-1">{CATEGORY_ICONS[result.category]} {result.category}</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 col-span-2">
              <p className="text-xs text-slate-400">Description</p>
              <p className="text-white text-sm mt-1">{result.description}</p>
            </div>
            {result.merchant && (
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-xs text-slate-400">Merchant</p>
                <p className="text-white text-sm mt-1">{result.merchant}</p>
              </div>
            )}
            {result.date && (
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-xs text-slate-400">Date</p>
                <p className="text-white text-sm mt-1">{new Date(result.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            )}
          </div>

          {result.items?.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-2">Items detected:</p>
              <div className="space-y-1">
                {result.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-300">{item.name}</span>
                    <span className="text-white font-mono">₹{item.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setResult(null); setFile(null); setPreview(null); }}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-all"
            >
              Scan Another
            </button>
            <button
              onClick={saveTransaction}
              disabled={saving}
              className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : '✓ Save Transaction'}
            </button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="font-medium text-slate-300 mb-3 text-sm">📌 Tips for best results</h3>
        <ul className="space-y-2 text-xs text-slate-400">
          <li>• Ensure the receipt is well-lit and not blurry</li>
          <li>• Include the total amount in the photo</li>
          <li>• The merchant name and date should be visible</li>
          <li>• Flatten crumpled receipts before scanning</li>
          <li>• Higher resolution images give more accurate results</li>
        </ul>
      </div>
    </div>
  );
}
