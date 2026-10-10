"use client";

import React, { useState, useEffect } from "react";
import {
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Car,
  Fuel,
  Utensils,
  Plane,
  Building2,
  FileQuestion,
  ChevronRight,
  ShieldCheck,
  Ban,
} from "lucide-react";
import { TimelineTracker } from "./TimelineTracker";
import { StoredExpenseRow } from "@/lib/supabase/client";

interface DashboardTabProps {
  currentRole: "emp_402" | "mgr_101";
  refreshTrigger: number;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ currentRole, refreshTrigger }) => {
  const [expenses, setExpenses] = useState<StoredExpenseRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchClaims = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch claims from backend API
      const url = currentRole === "emp_402" ? "/api/expenses?userId=emp_402" : "/api/expenses";
      const res = await fetch(url);
      const data = await res.json();
      const apiExpenses: StoredExpenseRow[] = Array.isArray(data.expenses) ? data.expenses : [];

      // 2. Read locally cached expenses to guarantee instant visibility of newly created claims
      let localCached: StoredExpenseRow[] = [];
      try {
        const raw = localStorage.getItem("aitask_cached_expenses");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            localCached = parsed.filter(
              (item) => currentRole !== "emp_402" || !item.user_id || item.user_id === "emp_402"
            );
          }
        }
      } catch (e) {}

      // 3. Merge: prioritize newer state between API and local cache
      const expenseMap = new Map<string, StoredExpenseRow>();
      // First populate with API expenses
      apiExpenses.forEach((exp) => expenseMap.set(exp.id, exp));
      // Then merge local cached expenses (adding any missing ones or updating if newer)
      localCached.forEach((local) => {
        const existing = expenseMap.get(local.id);
        if (!existing) {
          expenseMap.set(local.id, local);
        } else {
          // If local has updated status (e.g. submitted to Pending Approval), prefer it
          if (local.status !== existing.status && local.status !== "Draft") {
            expenseMap.set(local.id, { ...existing, ...local });
          }
        }
      });

      const mergedList = Array.from(expenseMap.values()).sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      setExpenses(mergedList);

      // Keep local cache synced
      try {
        localStorage.setItem("aitask_cached_expenses", JSON.stringify(mergedList));
      } catch (e) {}
    } catch (err) {
      console.error("Failed to load claims:", err);
      // Fallback to local cache if network drops
      try {
        const raw = localStorage.getItem("aitask_cached_expenses");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setExpenses(parsed);
          }
        }
      } catch (e) {}
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [currentRole, refreshTrigger]);

  const handleStatusTransition = async (expenseId: string, nextStatus: string) => {
    setActionInProgress(expenseId);
    // Optimistically update UI and local cache
    setExpenses((prev) =>
      prev.map((e) => (e.id === expenseId ? { ...e, status: nextStatus } : e))
    );
    try {
      const raw = localStorage.getItem("aitask_cached_expenses");
      if (raw) {
        const list = JSON.parse(raw);
        const updated = list.map((e: any) =>
          e.id === expenseId ? { ...e, status: nextStatus, updated_at: new Date().toISOString() } : e
        );
        localStorage.setItem("aitask_cached_expenses", JSON.stringify(updated));
      }
    } catch (e) {}

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchClaims();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Spending analytics
  const totalAmount = expenses.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
  const pendingAmount = expenses
    .filter((e) => e.status === "Pending Approval")
    .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
  const settledAmount = expenses
    .filter((e) => e.status === "Settlement Processing" || e.status === "Paid")
    .reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
  const pendingCount = expenses.filter((e) => e.status === "Pending Approval").length;

  // Filtered expenses
  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch =
      (e.vendor_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.remarks && e.remarks.toLowerCase().includes(searchTerm.toLowerCase())) ||
      e.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === "ALL" || e.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const getBillIcon = (type: string) => {
    switch (type) {
      case "CAB_LOCAL":
        return <Car className="w-4 h-4 text-amber-400" />;
      case "FUEL":
        return <Fuel className="w-4 h-4 text-rose-400" />;
      case "FOOD":
        return <Utensils className="w-4 h-4 text-emerald-400" />;
      case "FLIGHT":
        return <Plane className="w-4 h-4 text-sky-400" />;
      case "HOTEL":
        return <Building2 className="w-4 h-4 text-violet-400" />;
      default:
        return <FileQuestion className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-950">
      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Claims Value</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-2">₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          <span className="text-[11px] text-slate-500 mt-1 block">{expenses.length} claims recorded</span>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Awaiting Manager Approval</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-300 mt-2">₹{pendingAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          <span className="text-[11px] text-amber-400/80 mt-1 block">{pendingCount} claims pending review</span>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Settled & Paid</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-300 mt-2">₹{settledAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          <span className="text-[11px] text-emerald-400/80 mt-1 block">Successfully processed</span>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Active Role</span>
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg font-bold text-white mt-2">
            {currentRole === "emp_402" ? "Employee (emp_402)" : "Manager (mgr_101)"}
          </p>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {currentRole === "emp_402" ? "Personal submission view" : "Full organization approval privileges"}
          </span>
        </div>
      </div>

      {/* Table Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by vendor, remarks, or ID..."
            className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {["ALL", "Draft", "Pending Approval", "Settlement Processing", "Paid", "Awaiting User Input"].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedStatus === status
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800"
              }`}
            >
              {status}
            </button>
          ))}
          <button
            onClick={fetchClaims}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800 transition"
            title="Refresh claims"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Claims Data Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Claim ID & Date</th>
                <th className="py-3 px-4">Category & Vendor</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Lifecycle Timeline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No expense claims match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-800/40 transition">
                    {/* ID & Date */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-indigo-400 font-bold">
                        #{exp.id.slice(0, 8)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {exp.bill_date}
                      </div>
                    </td>

                    {/* Category & Vendor */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700/80">
                          {getBillIcon(exp.bill_type)}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{exp.vendor_name}</p>
                          <p className="text-[11px] text-slate-400 truncate max-w-xs">
                            {exp.remarks || `${exp.bill_type} expense`}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-white text-sm">
                        ₹{Number(exp.total_amount).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500 block uppercase">
                        {exp.payment_mode || "UPI"}
                      </span>
                    </td>

                    {/* Lifecycle Timeline */}
                    <td className="py-3.5 px-4">
                      <TimelineTracker status={exp.status} size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      {currentRole === "mgr_101" && exp.status === "Pending Approval" && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleStatusTransition(exp.id, "Rejected")}
                            disabled={actionInProgress === exp.id}
                            className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            Reject
                          </button>
                          <button
                            onClick={() => handleStatusTransition(exp.id, "Settlement Processing")}
                            disabled={actionInProgress === exp.id}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition flex items-center gap-1 shadow-sm"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Approve
                          </button>
                        </div>
                      )}

                      {currentRole === "mgr_101" && exp.status === "Settlement Processing" && (
                        <button
                          onClick={() => handleStatusTransition(exp.id, "Paid")}
                          disabled={actionInProgress === exp.id}
                          className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold transition shadow-sm"
                        >
                          Mark Paid
                        </button>
                      )}

                      {exp.status === "Paid" && (
                        <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Disbursed
                        </span>
                      )}

                      {exp.status === "Rejected" && (
                        <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          Closed
                        </span>
                      )}

                      {exp.status === "Draft" && (
                        <button
                          onClick={() => handleStatusTransition(exp.id, "Pending Approval")}
                          disabled={actionInProgress === exp.id}
                          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition shadow-sm"
                        >
                          Submit Claim
                        </button>
                      )}

                      {currentRole === "emp_402" && exp.status !== "Paid" && exp.status !== "Rejected" && exp.status !== "Draft" && (
                        <span className="text-[11px] text-slate-500 italic">
                          Under processing
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
