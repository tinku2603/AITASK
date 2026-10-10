"use client";

import React from "react";
import { UserCheck, Shield, Sparkles, Settings, Bot, Layers } from "lucide-react";
import { LLMProvider } from "@/lib/llm/factory";

interface HeaderProps {
  currentRole: "emp_402" | "mgr_101";
  onRoleChange: (role: "emp_402" | "mgr_101") => void;
  activeProvider: LLMProvider;
  onOpenSettings: () => void;
  pendingCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  activeProvider,
  onOpenSettings,
  pendingCount = 0,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand title */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-sm font-bold text-white tracking-tight">Agentic Reimbursement Hub</h1>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              Multi-Agent AI
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Vision Extraction ➔ pgvector De-dup ➔ Human-in-the-Loop ➔ ERP Executor
          </p>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center space-x-3">
        {/* Active Provider Pill */}
        <button
          onClick={onOpenSettings}
          className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-medium text-slate-300 transition"
          title="Configure AI & Supabase"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="uppercase text-[11px] font-bold text-indigo-300">{activeProvider}</span>
          <Settings className="w-3.5 h-3.5 text-slate-400 ml-1" />
        </button>

        {/* Role Switcher (Mock Login) */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onRoleChange("emp_402")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              currentRole === "emp_402"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Employee (emp_402)</span>
          </button>

          <button
            onClick={() => onRoleChange("mgr_101")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition relative ${
              currentRole === "mgr_101"
                ? "bg-violet-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Manager (mgr_101)</span>
            {pendingCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1 right-1" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
