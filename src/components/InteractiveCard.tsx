"use client";

import React, { useState } from "react";
import { HitlCardPayload, ExpenseRecord } from "@/lib/agents/types";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Receipt,
  Building,
  Calendar,
  CreditCard,
  Edit3,
} from "lucide-react";

interface InteractiveCardProps {
  card: HitlCardPayload;
  onResolved: (expenseId: string, action: string, updatedExpense?: any) => void;
}

export const InteractiveCard: React.FC<InteractiveCardProps> = ({ card, onResolved }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialResolved =
    card.expense_data.status === "Pending Approval"
      ? (card.reason === "MISSING_METADATA" ? "manual_submitted" : "confirmed")
      : card.expense_data.status === "Rejected"
      ? "discarded"
      : null;
  const [resolvedStatus, setResolvedStatus] = useState<string | null>(initialResolved);

  React.useEffect(() => {
    if (card.expense_data.status === "Pending Approval") {
      setResolvedStatus(card.reason === "MISSING_METADATA" ? "manual_submitted" : "confirmed");
    } else if (card.expense_data.status === "Rejected") {
      setResolvedStatus("discarded");
    }
  }, [card.expense_data.status, card.reason]);

  // Editable fields for missing metadata scenario
  const [vendorName, setVendorName] = useState(card.expense_data.vendor_name || "");
  const [billDate, setBillDate] = useState(card.expense_data.bill_date || new Date().toISOString().split("T")[0]);
  const [totalAmount, setTotalAmount] = useState<string>(
    card.expense_data.total_amount !== null && card.expense_data.total_amount !== undefined
      ? String(card.expense_data.total_amount)
      : ""
  );

  const handleConfirmUnique = async () => {
    setIsSubmitting(true);
    try {
      try {
        const raw = localStorage.getItem("aitask_cached_expenses");
        if (raw) {
          const list = JSON.parse(raw);
          const updated = list.map((item: any) =>
            item.id === card.expense_id
              ? { ...item, status: "Pending Approval", updated_at: new Date().toISOString() }
              : item
          );
          localStorage.setItem("aitask_cached_expenses", JSON.stringify(updated));
        }
      } catch (e) {}

      const res = await fetch(`/api/expenses/${card.expense_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_unique", expense: card.expense_data }),
      });
      const data = await res.json();
      setResolvedStatus("confirmed");
      onResolved(card.expense_id, "confirm_unique", data.expense);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscardDuplicate = async () => {
    setIsSubmitting(true);
    try {
      try {
        const raw = localStorage.getItem("aitask_cached_expenses");
        if (raw) {
          const list = JSON.parse(raw);
          const updated = list.map((item: any) =>
            item.id === card.expense_id
              ? { ...item, status: "Rejected", updated_at: new Date().toISOString() }
              : item
          );
          localStorage.setItem("aitask_cached_expenses", JSON.stringify(updated));
        }
      } catch (e) {}

      const res = await fetch(`/api/expenses/${card.expense_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard_duplicate", expense: card.expense_data }),
      });
      const data = await res.json();
      setResolvedStatus("discarded");
      onResolved(card.expense_id, "discard_duplicate", data.expense);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!vendorName || !totalAmount || !billDate) {
      alert("Please fill in all required fields (Vendor, Date, and Amount).");
      return;
    }

    setIsSubmitting(true);
    try {
      try {
        const raw = localStorage.getItem("aitask_cached_expenses");
        const list = raw ? JSON.parse(raw) : [];
        const item = {
          ...card.expense_data,
          id: card.expense_id,
          vendor_name: vendorName,
          bill_date: billDate,
          total_amount: parseFloat(totalAmount),
          status: "Pending Approval",
          updated_at: new Date().toISOString(),
        };
        const idx = list.findIndex((i: any) => i.id === card.expense_id);
        if (idx >= 0) list[idx] = { ...list[idx], ...item };
        else list.unshift(item);
        localStorage.setItem("aitask_cached_expenses", JSON.stringify(list));
      } catch (e) {}

      const res = await fetch(`/api/expenses/${card.expense_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_resolve",
          expense: {
            vendor_name: vendorName,
            bill_date: billDate,
            total_amount: parseFloat(totalAmount),
          },
        }),
      });
      const data = await res.json();
      setResolvedStatus("manual_submitted");
      onResolved(card.expense_id, "manual_resolve", data.expense);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resolvedStatus === "confirmed") {
    return (
      <div className="mt-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-sm flex items-center space-x-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-200">Confirmed as Unique Claim</p>
          <p className="text-xs text-emerald-400/80">
            Override applied. Claim #{card.expense_id.slice(0, 8)} sent to ERP and set to Pending Approval.
          </p>
        </div>
      </div>
    );
  }

  if (resolvedStatus === "discarded") {
    return (
      <div className="mt-3 p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 text-slate-400 text-sm flex items-center space-x-3">
        <XCircle className="w-5 h-5 text-slate-500 shrink-0" />
        <div>
          <p className="font-semibold text-slate-300">Duplicate Discarded</p>
          <p className="text-xs text-slate-500">
            Claim #{card.expense_id.slice(0, 8)} has been dropped and archived.
          </p>
        </div>
      </div>
    );
  }

  if (resolvedStatus === "manual_submitted") {
    return (
      <div className="mt-3 p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-indigo-300 text-sm flex items-center space-x-3">
        <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
        <div>
          <p className="font-semibold text-indigo-200">Missing Metadata Resolved</p>
          <p className="text-xs text-indigo-400/80">
            Manual fields updated. Claim #{card.expense_id.slice(0, 8)} submitted to ERP Pending Approval.
          </p>
        </div>
      </div>
    );
  }

  const isDuplicateCase = card.reason === "POTENTIAL_DUPLICATE";
  const isMissingMetaCase = card.reason === "MISSING_METADATA";
  const isMathMismatchCase = card.reason === "MATH_MISMATCH";

  return (
    <div className="mt-3 rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-slate-900/90 p-4 shadow-xl backdrop-blur-md">
      {/* Header Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            Agent 3: Human-In-The-Loop Action Required
          </span>
        </div>
        {card.similarity_score !== undefined && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {(card.similarity_score * 100).toFixed(1)}% Match
          </span>
        )}
      </div>

      {/* Description message */}
      <p className="mt-3 text-sm text-slate-200 leading-relaxed">{card.message}</p>

      {/* CASE 1: POTENTIAL DUPLICATE COMPARISON */}
      {isDuplicateCase && card.conflicting_expense && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* New Claim */}
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/60">
            <div className="flex items-center space-x-1.5 text-indigo-400 font-semibold mb-2">
              <Receipt className="w-3.5 h-3.5" />
              <span>Current Claim Being Evaluated</span>
            </div>
            <div className="space-y-1 text-slate-300">
              <p><strong className="text-slate-400">Vendor:</strong> {card.expense_data.vendor_name || "N/A"}</p>
              <p><strong className="text-slate-400">Date:</strong> {card.expense_data.bill_date}</p>
              <p><strong className="text-slate-400">Amount:</strong> ₹{card.expense_data.total_amount?.toFixed(2)}</p>
              <p><strong className="text-slate-400">Type:</strong> {card.expense_data.bill_type}</p>
            </div>
          </div>

          {/* Existing Claim in DB */}
          <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30">
            <div className="flex items-center space-x-1.5 text-rose-400 font-semibold mb-2">
              <Building className="w-3.5 h-3.5" />
              <span>Existing Claim in Database</span>
            </div>
            <div className="space-y-1 text-slate-300">
              <p><strong className="text-slate-400">Vendor:</strong> {card.conflicting_expense.matched_vendor}</p>
              <p><strong className="text-slate-400">Date:</strong> {card.conflicting_expense.matched_date}</p>
              <p><strong className="text-slate-400">Amount:</strong> ₹{card.conflicting_expense.matched_amount?.toFixed(2)}</p>
              <p><strong className="text-slate-400">Ref ID:</strong> #{card.conflicting_expense.matched_expense_id.slice(0, 8)}</p>
            </div>
          </div>
        </div>
      )}

      {/* CASE 2: MISSING METADATA MANUAL INPUT */}
      {isMissingMetaCase && (
        <div className="mt-4 p-3.5 rounded-lg bg-slate-900/90 border border-slate-700 space-y-3">
          <div className="flex items-center space-x-1.5 text-xs text-amber-300 font-semibold">
            <Edit3 className="w-3.5 h-3.5" />
            <span>Manual Metadata Entry</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Vendor Name</label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. Swiggy, Uber"
                className="w-full px-2.5 py-1.5 text-xs rounded-md bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Bill Date</label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-md bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Total Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="450.00"
                className="w-full px-2.5 py-1.5 text-xs rounded-md bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
        {isMissingMetaCase ? (
          <button
            onClick={handleManualSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center space-x-1.5 disabled:opacity-50"
          >
            <span>Save & Submit to ERP</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <>
            <button
              onClick={handleDiscardDuplicate}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>[Discard Duplicate]</span>
            </button>
            <button
              onClick={handleConfirmUnique}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-md shadow-emerald-950/40 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>[Confirm as Unique]</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
