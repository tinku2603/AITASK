"use client";

import React, { useState, useEffect } from "react";
import { X, Server, Database, Key, Sparkles, Check, Copy, RefreshCw } from "lucide-react";
import { LLMProvider } from "@/lib/llm/factory";

interface ProviderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider: LLMProvider;
  onSaveConfig: (config: { provider: LLMProvider; apiKey?: string; baseURL?: string; modelName?: string }) => void;
}

export const ProviderSettingsModal: React.FC<ProviderSettingsModalProps> = ({
  isOpen,
  onClose,
  activeProvider,
  onSaveConfig,
}) => {
  const [provider, setProvider] = useState<LLMProvider>(activeProvider);
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [modelName, setModelName] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    setProvider(activeProvider);
    checkHealth();
  }, [activeProvider]);

  const checkHealth = async () => {
    setIsTesting(true);
    try {
      const res = await fetch("/api/settings/test-connection");
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig({
      provider,
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
      modelName: modelName || undefined,
    });
    onClose();
  };

  const copySqlSchema = async () => {
    const sql = `-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    bill_type TEXT CHECK (bill_type IN ('CAB_LOCAL', 'FUEL', 'FOOD', 'FLIGHT', 'HOTEL', 'OTHER')),
    bill_date DATE NOT NULL,
    vendor_name TEXT NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    payment_mode TEXT,
    remarks TEXT,
    specific_details JSONB DEFAULT '{}'::jsonb,
    status TEXT CHECK (status IN ('Draft', 'Awaiting User Input', 'Pending Approval', 'Settlement Processing', 'Paid', 'Rejected')) DEFAULT 'Draft',
    embedding vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_expenses_embedding ON expenses USING hnsw (embedding vector_cosine_ops);

-- 4. Match expenses RPC
CREATE OR REPLACE FUNCTION match_expenses(
    query_embedding vector(768),
    filter_user_id text,
    filter_bill_date date,
    match_threshold float DEFAULT 0.70,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id TEXT, user_id TEXT, bill_type TEXT, bill_date DATE, vendor_name TEXT,
    total_amount NUMERIC(12, 2), currency TEXT, payment_mode TEXT, remarks TEXT,
    specific_details JSONB, status TEXT, similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.user_id, e.bill_type, e.bill_date, e.vendor_name,
           e.total_amount, e.currency, e.payment_mode, e.remarks,
           e.specific_details, e.status, 1 - (e.embedding <=> query_embedding) AS similarity
    FROM expenses e
    WHERE e.user_id = filter_user_id AND e.bill_date = filter_bill_date
      AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
    ORDER BY e.embedding <=> query_embedding ASC LIMIT match_count;
END;
$$;

-- 5. Conversations & Chat History Tables
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant', 'system')),
    text TEXT NOT NULL,
    files JSONB DEFAULT '[]'::jsonb,
    events JSONB DEFAULT '[]'::jsonb,
    hitl_cards JSONB DEFAULT '[]'::jsonb,
    draft_cards JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, created_at ASC);`;

    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">AI Engine & Supabase Settings</h2>
              <p className="text-xs text-slate-400">Select model provider (Gemini, Groq, Ollama, llama.cpp) & pgvector</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live System Diagnostics */}
        <div className="mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              Live Backend Diagnostics
            </span>
            <button
              onClick={checkHealth}
              disabled={isTesting}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              <RefreshCw className={`w-3 h-3 ${isTesting ? "animate-spin" : ""}`} />
              Re-test
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Database Store</span>
              <span className={`font-semibold ${testResult?.supabase?.live ? "text-emerald-400" : "text-amber-400"}`}>
                {testResult?.supabase?.mode || "Evaluating..."}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">LLM Provider</span>
              <span className="font-semibold text-indigo-300">
                {testResult?.llm?.activeProvider?.toUpperCase() || "GEMINI"} ({testResult?.llm?.modelName || "gemini-2.0-flash"})
              </span>
            </div>
          </div>
        </div>

        {/* Provider Selector */}
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select Active Vision / Reasoning Engine
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: "gemini", label: "Google Gemini", sub: "Flash 2.0 / 1.5" },
                { id: "groq", label: "Groq Cloud", sub: "Llama 3.2 Vision" },
                { id: "ollama", label: "Local Ollama", sub: "Gemma / Llama" },
                { id: "llamacpp", label: "llama.cpp", sub: "Local :8080" },
                { id: "mock", label: "Mock Sandbox", sub: "Offline Simulator" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id as LLMProvider)}
                  className={`p-3 rounded-xl text-left border transition ${
                    provider === p.id
                      ? "bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500"
                      : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <p className="text-xs font-bold">{p.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{p.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Conditional Provider Fields */}
          {provider === "gemini" && (
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
              <div>
                <label className="block text-xs text-slate-300 font-medium mb-1">Gemini API Key (Optional Override)</label>
                <input
                  type="password"
                  placeholder="Leave empty to use GEMINI_API_KEY from .env.local"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {provider === "groq" && (
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
              <div>
                <label className="block text-xs text-slate-300 font-medium mb-1">Groq API Key</label>
                <input
                  type="password"
                  placeholder="gsk_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {provider === "ollama" && (
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
              <div>
                <label className="block text-xs text-slate-300 font-medium mb-1">Ollama API Base URL</label>
                <input
                  type="text"
                  placeholder="http://localhost:11434/v1"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 font-medium mb-1">Ollama Model Name</label>
                <input
                  type="text"
                  placeholder="gemma2 (or llama3.2-vision)"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {provider === "llamacpp" && (
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
              <div>
                <label className="block text-xs text-slate-300 font-medium mb-1">llama.cpp Server Base URL</label>
                <input
                  type="text"
                  placeholder="http://localhost:8080/v1"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Supabase SQL Migration Helper */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Supabase pgvector & Multi-Chat Schema
              </span>
              <button
                onClick={copySqlSchema}
                className="px-2.5 py-1 text-xs rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 transition flex items-center gap-1"
              >
                {copiedSql ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                {copiedSql ? "Copied SQL!" : "Copy Schema SQL"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Paste into your Supabase Dashboard ➔ SQL Editor to enable pgvector, create the expenses, conversations, and chat_messages tables.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-md shadow-indigo-950/40"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
