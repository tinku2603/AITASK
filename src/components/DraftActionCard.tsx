"use client";

import React, { useState, useEffect } from "react";
import { DraftCardPayload, ExpenseRecord } from "@/lib/agents/types";
import {
  FileCheck,
  Send,
  Eye,
  CheckCircle2,
  Calendar,
  Building,
  CreditCard,
  Tag,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface DraftActionCardProps {
  card: DraftCardPayload;
  onOpenDraftReview: (expense: ExpenseRecord) => void;
  onDirectSubmit: (expenseId: string, expenseData?: ExpenseRecord) => Promise<void>;
}

export const DraftActionCard: React.FC<DraftActionCardProps> = ({
  card,
  onOpenDraftReview,
  onDirectSubmit,
}) => {
  const isAlreadySubmitted =
    Boolean((card as any).submitted) ||
    card.expense_data?.status === "Pending Approval" ||
    card.expense_data?.status === "Settlement Processing" ||
    card.expense_data?.status === "Paid";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(isAlreadySubmitted);

  useEffect(() => {
    if (isAlreadySubmitted) {
      setSubmitted(true);
    }
  }, [isAlreadySubmitted]);

  const handleDirectSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onDirectSubmit(card.expense_id, card.expense_data);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted || isAlreadySubmitted) {
    return (
      <div className="mt-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center space-x-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-200">Claim Submitted to ERP</p>
          <p className="text-[11px] text-emerald-400/80">
            Draft #{card.expense_id ? card.expense_id.slice(0, 8) : "N/A"} advanced directly to Pending Approval.
          </p>
        </div>
      </div>
    );
  }

  const exp = card.expense_data;
  const lineItemsCount = exp.specific_details?.line_items?.length || 0;

  return (
    <div className="mt-3 rounded-xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/30 to-slate-900/90 p-4 shadow-lg backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
            <FileCheck className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
            Expense Draft Ready
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          Status: Draft
        </span>
      </div>

      {/* Notice if any (e.g. Round Trip) */}
      {card.remarks_notice && (
        <div className="mt-2 text-xs text-amber-300/90 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
          ℹ️ {card.remarks_notice}
        </div>
      )}

      {/* Draft Summary Details */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] text-slate-500 uppercase block">Vendor</span>
          <span className="font-semibold text-white truncate block">{exp.vendor_name || "Unknown"}</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] text-slate-500 uppercase block">Date</span>
          <span className="font-semibold text-slate-200 block">{exp.bill_date || "N/A"}</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] text-slate-500 uppercase block">Category</span>
          <span className="font-semibold text-slate-200 block">{exp.bill_type}</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] text-slate-500 uppercase block">Total Amount</span>
          <span className="font-bold text-emerald-400 block">₹{Number(exp.total_amount).toFixed(2)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
        <button
          onClick={() => onOpenDraftReview(exp)}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center space-x-1.5"
        >
          <Eye className="w-3.5 h-3.5 text-indigo-400" />
          <span>[View & Review Draft]</span>
        </button>

        <button
          onClick={handleDirectSubmit}
          disabled={isSubmitting}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center space-x-1.5 shadow-md shadow-indigo-950/40 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>[Submit Directly to ERP]</span>
        </button>
      </div>
    </div>
  );
};
