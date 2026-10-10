"use client";

import React, { useState, useEffect } from "react";
import { ExpenseRecord, LineItem } from "@/lib/agents/types";
import {
  X,
  Send,
  Save,
  Plus,
  Trash2,
  Receipt,
  FileCheck,
  Building,
  Calendar,
  CreditCard,
  DollarSign,
} from "lucide-react";

interface DraftReviewModalProps {
  isOpen: boolean;
  expense: ExpenseRecord | null;
  onClose: () => void;
  onSubmitToErp: (updatedExpense: ExpenseRecord) => Promise<void>;
  onSaveDraftOnly: (updatedExpense: ExpenseRecord) => Promise<void>;
}

export const DraftReviewModal: React.FC<DraftReviewModalProps> = ({
  isOpen,
  expense,
  onClose,
  onSubmitToErp,
  onSaveDraftOnly,
}) => {
  const [vendorName, setVendorName] = useState("");
  const [billDate, setBillDate] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [billType, setBillType] = useState<string>("OTHER");
  const [currency, setCurrency] = useState("INR");
  const [remarks, setRemarks] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (expense) {
      setVendorName(expense.vendor_name || "");
      setBillDate(expense.bill_date || "");
      setTotalAmount(expense.total_amount || 0);
      setBillType(expense.bill_type || "OTHER");
      setCurrency(expense.currency || "INR");
      setRemarks(expense.remarks || "");
      setLineItems(expense.specific_details?.line_items || []);
    }
  }, [expense]);

  if (!isOpen || !expense) return null;

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: "New Item", quantity: 1, amount: 0 }]);
  };

  const handleRemoveLineItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const handleUpdateLineItem = (idx: number, field: keyof LineItem, val: any) => {
    const updated = [...lineItems];
    updated[idx] = { ...updated[idx], [field]: val };
    setLineItems(updated);
  };

  const buildUpdatedExpense = (): ExpenseRecord => {
    return {
      ...expense,
      vendor_name: vendorName,
      bill_date: billDate,
      total_amount: Number(totalAmount),
      bill_type: billType as any,
      currency,
      remarks,
      specific_details: {
        ...expense.specific_details,
        line_items: lineItems,
      },
    };
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmitToErp(buildUpdatedExpense());
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    setIsSubmitting(true);
    try {
      await onSaveDraftOnly(buildUpdatedExpense());
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Review & Edit Expense Draft</h2>
              <p className="text-xs text-slate-400">
                Verify extracted line items and details before submitting for reimbursement
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Meta Fields */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 font-medium mb-1">Vendor / Merchant</label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Bill Date</label>
            <input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Category</label>
            <select
              value={billType}
              onChange={(e) => setBillType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="CAB_LOCAL">CAB_LOCAL</option>
              <option value="FUEL">FUEL</option>
              <option value="FOOD">FOOD</option>
              <option value="FLIGHT">FLIGHT</option>
              <option value="HOTEL">HOTEL</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Total Stated Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={totalAmount}
              onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 font-bold focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-medium mb-1">Remarks / Business Purpose</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Client visit to Whitefield"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Itemized Line Items */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Itemized Line Items ({lineItems.length})
            </span>
            <button
              onClick={handleAddLineItem}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </button>
          </div>

          {lineItems.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-500">
              No individual line items parsed. Total claim amount is based on overall receipt footer.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {lineItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                >
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => handleUpdateLineItem(idx, "description", e.target.value)}
                    placeholder="Description"
                    className="flex-1 bg-transparent border-none text-slate-200 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) => handleUpdateLineItem(idx, "amount", parseFloat(e.target.value) || 0)}
                    placeholder="Amount"
                    className="w-24 bg-slate-900 px-2 py-1 rounded text-right font-mono text-slate-100 border border-slate-700"
                  />
                  <button
                    onClick={() => handleRemoveLineItem(idx)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end space-x-2.5">
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save as Draft Only</span>
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow-md shadow-indigo-950/40 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit to ERP (Pending Approval)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
