"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Send,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  Bot,
  User,
  Paperclip,
  X,
  Play,
  Eye,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { InteractiveCard } from "./InteractiveCard";
import { DraftActionCard } from "./DraftActionCard";
import { DraftReviewModal } from "./DraftReviewModal";
import { PdfReceiptSplitViewer, PreviewableDocument } from "./PdfReceiptSplitViewer";
import {
  HitlCardPayload,
  DraftCardPayload,
  PipelineEvent,
  ExpenseRecord,
} from "@/lib/agents/types";
import { LLMConfig } from "@/lib/llm/factory";

export interface Message {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  files?: Array<{ name: string; type: string; base64?: string }>;
  events?: PipelineEvent[];
  hitlCards?: HitlCardPayload[];
  draftCards?: DraftCardPayload[];
  duplicateWarnings?: Array<{ reason: string; similarity: number }>;
  timestamp: string;
}

interface ChatInterfaceProps {
  userId: string;
  conversationId: string;
  llmConfig: Partial<LLMConfig>;
  onExpenseCreated?: () => void;
  onConversationUpdated?: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  userId,
  conversationId,
  llmConfig,
  onExpenseCreated,
  onConversationUpdated,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "👋 Hello! I am your Autonomous Expense Agent. Drop any receipt (Image or PDF) or pick a test preset below. I will run the multi-agent pipeline: Extraction ➔ pgvector De-duplication ➔ Human-in-the-Loop review ➔ ERP Execution.",
      timestamp: "",
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; type: string; base64: string }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Split-pane Document Preview states
  const [isSplitPreviewOpen, setIsSplitPreviewOpen] = useState(false);
  const [previewDocuments, setPreviewDocuments] = useState<PreviewableDocument[]>([]);
  const [activeDocIndex, setActiveDocIndex] = useState(0);

  // Draft Review Modal states
  const [reviewExpense, setReviewExpense] = useState<ExpenseRecord | null>(null);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Load chat history when conversationId changes
  useEffect(() => {
    if (!conversationId) return;

    // Helper: rehydrate submitted state and filter out deleted expenses from cards
    const rehydrateSubmitted = (msgs: Message[]): Message[] => {
      try {
        const delRaw = localStorage.getItem("aitask_deleted_expense_ids");
        const deletedIds: string[] = delRaw ? JSON.parse(delRaw) : [];

        const submittedRaw = localStorage.getItem("aitask_submitted_expense_ids");
        const submittedIds: string[] = submittedRaw ? JSON.parse(submittedRaw) : [];

        return msgs.map((msg) => {
          let updatedCards = msg.draftCards;
          if (updatedCards && updatedCards.length > 0) {
            updatedCards = updatedCards
              .filter((dc) => !deletedIds.includes(dc.expense_id))
              .map((dc) => {
                if (submittedIds.includes(dc.expense_id)) {
                  return {
                    ...dc,
                    submitted: true,
                    expense_data: { ...dc.expense_data, status: "Pending Approval" as const },
                  };
                }
                return dc;
              });
          }

          let updatedHitl = msg.hitlCards;
          if (updatedHitl && updatedHitl.length > 0) {
            updatedHitl = updatedHitl.filter((hc) => !deletedIds.includes(hc.expense_id));
          }

          return { ...msg, draftCards: updatedCards, hitlCards: updatedHitl };
        });
      } catch {
        return msgs;
      }
    };

    // 1. Instant optimistic restore from local browser cache
    try {
      const cached = localStorage.getItem(`aitask_msgs_${conversationId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(rehydrateSubmitted(parsed));
          const docs: PreviewableDocument[] = [];
          parsed.forEach((m: any) => {
            if (m.files) {
              m.files.forEach((f: any) => {
                if (f.base64) docs.push({ name: f.name, type: f.type, base64: f.base64 });
              });
            }
          });
          if (docs.length > 0) setPreviewDocuments(docs);
        }
      }
    } catch (e) {}

    // 2. Fetch authoritative messages from backend / Supabase
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          const loaded: Message[] = data.messages.map((m: any) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            files: m.files,
            events: m.events,
            hitlCards: m.hitl_cards,
            draftCards: m.draft_cards,
            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }));
          // Rehydrate submitted state from persisted IDs before setting state
          const rehydrated = rehydrateSubmitted(loaded);
          setMessages(rehydrated);
          try {
            localStorage.setItem(`aitask_msgs_${conversationId}`, JSON.stringify(rehydrated));
          } catch (e) {}

          // Populate previewable documents from history
          const docs: PreviewableDocument[] = [];
          loaded.forEach((m) => {
            if (m.files) {
              m.files.forEach((f) => {
                if (f.base64) docs.push({ name: f.name, type: f.type, base64: f.base64 });
              });
            }
          });
          if (docs.length > 0) {
            setPreviewDocuments(docs);
          }
        } else {
          // If neither local cache nor DB has messages, show fresh session welcome
          const cached = localStorage.getItem(`aitask_msgs_${conversationId}`);
          if (!cached) {
            const welcomeMsg: Message[] = [
              {
                id: "welcome",
                sender: "assistant",
                text: "👋 New claim session initiated. Upload your receipt image or PDF to begin extraction.",
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              },
            ];
            setMessages(welcomeMsg);
          }
        }
      } catch (e) {
        console.error("Failed to load conversation history:", e);
      }
    };

    loadHistory();
  }, [conversationId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = (reader.result as string).split(",")[1];
        const newDoc: PreviewableDocument = {
          name: file.name,
          type: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/png"),
          base64: base64Data,
        };

        setAttachedFiles((prev) => [...prev, newDoc]);
        setPreviewDocuments((prev) => [...prev, newDoc]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const triggerPresetScenario = (scenario: "clean_cab" | "duplicate_bill" | "round_trip" | "multipage" | "blurry") => {
    let prompt = "";
    let mockFileName = "";

    if (scenario === "clean_cab") {
      prompt = "Process this clean cab slip for client meeting.";
      mockFileName = "uber_receipt_450.png";
    } else if (scenario === "duplicate_bill") {
      prompt = "Submit identical copy of today's Uber trip.";
      mockFileName = "uber_receipt_450_duplicate.png";
    } else if (scenario === "round_trip") {
      prompt = "Process this Uber return trip back to office from Whitefield.";
      mockFileName = "uber_return_trip_450.png";
    } else if (scenario === "multipage") {
      prompt = "Process this multi-page travel claim containing flight invoice and airport lunch.";
      mockFileName = "travel_combo_multipage.pdf";
    } else if (scenario === "blurry") {
      prompt = "Analyze this blurry restaurant receipt where footer date and amount are smudged.";
      mockFileName = "blurry_dinner_slip.jpg";
    }

    const placeholderBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const doc: PreviewableDocument = {
      name: mockFileName,
      type: mockFileName.endsWith(".pdf") ? "application/pdf" : "image/png",
      base64: placeholderBase64,
    };

    setPreviewDocuments((prev) => [doc, ...prev]);
    handleSendWithData(prompt, [doc]);
  };

  const handleSend = () => {
    if (!inputPrompt.trim() && attachedFiles.length === 0) return;
    handleSendWithData(inputPrompt, attachedFiles);
    setInputPrompt("");
    setAttachedFiles([]);
  };

  const handleSendWithData = async (
    promptText: string,
    files: Array<{ name: string; type: string; base64: string }>
  ) => {
    if (files.length === 0) {
      alert("Please attach at least one receipt document (Image or PDF) to trigger the agentic pipeline.");
      return;
    }

    const userMsgId = `user_${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: "user",
      text: promptText || "Extracted receipt file(s) attached.",
      files: files.map((f) => ({ name: f.name, type: f.type, base64: f.base64 })),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => {
      const updated = [...prev, userMsg];
      try {
        localStorage.setItem(`aitask_msgs_${conversationId}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    setIsProcessing(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptText,
          userId,
          conversationId,
          llmConfig,
          files: files.map((f) => ({
            name: f.name,
            mimeType: f.type,
            base64Data: f.base64,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to process receipt in agent pipeline.");
      }

      const pipeline = data.result;

      const assistantMsg: Message = {
        id: `asst_${Date.now()}`,
        sender: "assistant",
        text: pipeline.summary,
        events: pipeline.events,
        hitlCards: pipeline.hitlCards,
        draftCards: pipeline.draftCards,
        duplicateWarnings: pipeline.duplicateWarnings,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      // 1. Immediately cache new draft cards so Dashboard displays them without lag
      try {
        const raw = localStorage.getItem("aitask_cached_expenses");
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(pipeline.draftCards)) {
          for (const card of pipeline.draftCards) {
            const exp = card.expense_data;
            const item = {
              id: card.expense_id,
              user_id: exp.user_id || userId,
              bill_type: exp.bill_type || "OTHER",
              bill_date: exp.bill_date,
              vendor_name: exp.vendor_name,
              total_amount: exp.total_amount,
              currency: exp.currency || "INR",
              payment_mode: exp.payment_mode || "UPI",
              remarks: exp.remarks || "",
              specific_details: exp.specific_details || {},
              status: "Draft",
              created_at: new Date().toISOString(),
            };
            const idx = list.findIndex((i: any) => i.id === card.expense_id);
            if (idx >= 0) list[idx] = { ...list[idx], ...item };
            else list.unshift(item);
          }
        }
        if (Array.isArray(pipeline.submittedExpenses)) {
          for (const exp of pipeline.submittedExpenses) {
            const item = {
              id: exp.id,
              user_id: exp.user_id || userId,
              bill_type: exp.bill_type || "OTHER",
              bill_date: exp.bill_date,
              vendor_name: exp.vendor_name,
              total_amount: exp.total_amount,
              currency: exp.currency || "INR",
              payment_mode: exp.payment_mode || "UPI",
              remarks: exp.remarks || "",
              specific_details: exp.specific_details || {},
              status: "Pending Approval",
              created_at: new Date().toISOString(),
            };
            const idx = list.findIndex((i: any) => i.id === exp.id);
            if (idx >= 0) list[idx] = { ...list[idx], ...item };
            else list.unshift(item);
          }
        }
        localStorage.setItem("aitask_cached_expenses", JSON.stringify(list));
      } catch (e) {}

      setMessages((prev) => {
        const updated = [...prev, assistantMsg];
        try {
          localStorage.setItem(`aitask_msgs_${conversationId}`, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      if (onExpenseCreated) onExpenseCreated();
      if (onConversationUpdated) onConversationUpdated();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: "system",
          text: `⚠️ Pipeline Exception: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const markDraftAsSubmittedInChat = (expenseId: string) => {
    // Persist to a global list of submitted expense IDs (survives backend reloads)
    try {
      const raw = localStorage.getItem("aitask_submitted_expense_ids");
      const ids: string[] = raw ? JSON.parse(raw) : [];
      if (!ids.includes(expenseId)) {
        ids.push(expenseId);
        localStorage.setItem("aitask_submitted_expense_ids", JSON.stringify(ids));
      }
    } catch (e) {}

    setMessages((prev) => {
      const updated = prev.map((msg) => {
        if (!msg.draftCards || msg.draftCards.length === 0) return msg;
        const updatedCards = msg.draftCards.map((dc) => {
          if (dc.expense_id === expenseId) {
            return {
              ...dc,
              submitted: true,
              expense_data: {
                ...dc.expense_data,
                status: "Pending Approval" as const,
              },
            };
          }
          return dc;
        });
        return { ...msg, draftCards: updatedCards };
      });
      try {
        localStorage.setItem(`aitask_msgs_${conversationId}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Direct Submit Handler from DraftActionCard
  const handleDirectSubmitToErp = async (expenseId: string, expenseData?: ExpenseRecord) => {
    markDraftAsSubmittedInChat(expenseId);

    try {
      const raw = localStorage.getItem("aitask_cached_expenses");
      if (raw) {
        const list = JSON.parse(raw);
        const updated = list.map((item: any) =>
          item.id === expenseId
            ? { ...item, ...(expenseData || {}), status: "Pending Approval", updated_at: new Date().toISOString() }
            : item
        );
        localStorage.setItem("aitask_cached_expenses", JSON.stringify(updated));
      }
    } catch (e) {}

    const res = await fetch(`/api/expenses/${expenseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(expenseData || {}),
        status: "Pending Approval",
      }),
    });
    if (res.ok) {
      if (onExpenseCreated) onExpenseCreated();
    }
  };

  // Submit from DraftReviewModal
  const handleSubmitModalToErp = async (updatedExpense: ExpenseRecord) => {
    if (updatedExpense.id) {
      markDraftAsSubmittedInChat(updatedExpense.id);

      try {
        const raw = localStorage.getItem("aitask_cached_expenses");
        const list = raw ? JSON.parse(raw) : [];
        const fullItem = {
          ...updatedExpense,
          status: "Pending Approval",
          updated_at: new Date().toISOString(),
        };
        const idx = list.findIndex((i: any) => i.id === updatedExpense.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...fullItem };
        else list.unshift(fullItem);
        localStorage.setItem("aitask_cached_expenses", JSON.stringify(list));
      } catch (e) {}

      await fetch(`/api/expenses/${updatedExpense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updatedExpense,
          status: "Pending Approval",
        }),
      });
      if (onExpenseCreated) onExpenseCreated();
    }
  };

  const handleSaveDraftOnly = async (updatedExpense: ExpenseRecord) => {
    if (updatedExpense.id) {
      try {
        const raw = localStorage.getItem("aitask_cached_expenses");
        const list = raw ? JSON.parse(raw) : [];
        const fullItem = {
          ...updatedExpense,
          status: "Draft",
          updated_at: new Date().toISOString(),
        };
        const idx = list.findIndex((i: any) => i.id === updatedExpense.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...fullItem };
        else list.unshift(fullItem);
        localStorage.setItem("aitask_cached_expenses", JSON.stringify(list));
      } catch (e) {}

      await fetch(`/api/expenses/${updatedExpense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedExpense),
      });
      if (onExpenseCreated) onExpenseCreated();
    }
  };

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-slate-950">
      {/* Main Chat Flow (Left Pane) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Test Scenario Action Bar */}
        <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1">
              <Play className="w-3 h-3 text-indigo-400" />
              Presets:
            </span>
            <button
              onClick={() => triggerPresetScenario("clean_cab")}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 shrink-0 transition"
            >
              🚗 Clean Cab (₹450)
            </button>
            <button
              onClick={() => triggerPresetScenario("duplicate_bill")}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 shrink-0 transition"
            >
              ⚠️ Duplicate Bill
            </button>
            <button
              onClick={() => triggerPresetScenario("round_trip")}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-indigo-950/40 text-slate-300 hover:text-indigo-300 border border-slate-700 shrink-0 transition"
            >
              🔁 Round Trip Cab
            </button>
            <button
              onClick={() => triggerPresetScenario("multipage")}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-indigo-950/40 text-slate-300 hover:text-indigo-300 border border-slate-700 shrink-0 transition"
            >
              📑 Multi-Page Bill
            </button>
            <button
              onClick={() => triggerPresetScenario("blurry")}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-amber-950/40 text-slate-300 hover:text-amber-300 border border-slate-700 shrink-0 transition"
            >
              🌫️ Blurry Receipt
            </button>
          </div>

          {/* Toggle Split-Pane Preview button */}
          <button
            onClick={() => setIsSplitPreviewOpen(!isSplitPreviewOpen)}
            className={`ml-2 px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition shrink-0 ${
              isSplitPreviewOpen
                ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/40"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
            }`}
            title="Toggle Split-Screen PDF/Receipt Preview"
          >
            {isSplitPreviewOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Receipt Preview</span>
            {previewDocuments.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500 text-white font-bold">
                {previewDocuments.length}
              </span>
            )}
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 max-w-3xl ${
                msg.sender === "user" ? "ml-auto flex-row-reverse" : ""
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  msg.sender === "user"
                    ? "bg-indigo-600 text-white"
                    : msg.sender === "assistant"
                    ? "bg-slate-800 text-indigo-400 border border-slate-700"
                    : "bg-rose-950/60 text-rose-400 border border-rose-800"
                }`}
              >
                {msg.sender === "user" ? (
                  <User className="w-4 h-4" />
                ) : msg.sender === "assistant" ? (
                  <Bot className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
              </div>

              {/* Bubble Content */}
              <div
                className={`rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-indigo-600 text-white"
                    : msg.sender === "assistant"
                    ? "bg-slate-900 border border-slate-800 text-slate-200 shadow-md"
                    : "bg-rose-950/30 border border-rose-500/40 text-rose-300"
                }`}
              >
                {/* File Attachment previews */}
                {msg.files && msg.files.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-2">
                    {msg.files.map((file, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (file.base64) {
                            setPreviewDocuments((prev) => [
                              { name: file.name, type: file.type, base64: file.base64! },
                              ...prev,
                            ]);
                            setActiveDocIndex(0);
                            setIsSplitPreviewOpen(true);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-black/30 hover:bg-black/50 text-xs flex items-center gap-1.5 font-medium border border-white/10 transition cursor-pointer"
                        title="Click to preview in split viewer"
                      >
                        {file.type.includes("pdf") ? (
                          <FileText className="w-3.5 h-3.5 text-rose-300" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-300" />
                        )}
                        <span className="truncate max-w-[180px]">{file.name}</span>
                        <Eye className="w-3 h-3 text-slate-400 ml-0.5" />
                      </button>
                    ))}
                  </div>
                )}

                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Duplicate Warning Alert */}
                {msg.duplicateWarnings && msg.duplicateWarnings.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-rose-200">
                      <X className="w-4 h-4" />
                      <span>Agent 2: Definite Duplicate Blocked</span>
                    </div>
                    {msg.duplicateWarnings.map((dup, idx) => (
                      <p key={idx} className="text-rose-300/90 leading-normal">
                        {dup.reason} (Similarity: {(dup.similarity * 100).toFixed(1)}%)
                      </p>
                    ))}
                  </div>
                )}

                {/* Step Telemetry Log */}
                {msg.events && msg.events.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-1.5">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-indigo-400" />
                      Agent Orchestration Steps
                    </p>
                    <div className="space-y-1 text-xs">
                      {msg.events.map((ev, idx) => (
                        <div key={idx} className="flex items-start gap-2 py-0.5 text-slate-400">
                          <span className="text-[10px] text-slate-600 font-mono mt-0.5">
                            {ev.timestamp.split("T")[1]?.slice(0, 8)}
                          </span>
                          <span className="text-slate-300 leading-snug">{ev.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agent 3 HITL Cards */}
                {msg.hitlCards && msg.hitlCards.length > 0 && (
                  <div className="mt-2 space-y-3">
                    {msg.hitlCards.map((card) => (
                      <InteractiveCard
                        key={card.expense_id}
                        card={card}
                        onResolved={() => {
                          if (onExpenseCreated) onExpenseCreated();
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Draft Review vs Direct Submit Choice Cards */}
                {msg.draftCards && msg.draftCards.length > 0 && (
                  <div className="mt-2 space-y-3">
                    {msg.draftCards.map((card) => (
                      <DraftActionCard
                        key={card.expense_id}
                        card={card}
                        onOpenDraftReview={(expense) => {
                          setReviewExpense(expense);
                          setIsDraftModalOpen(true);
                        }}
                        onDirectSubmit={handleDirectSubmitToErp}
                      />
                    ))}
                  </div>
                )}

                {msg.timestamp && (
                  <span suppressHydrationWarning className="block text-[10px] text-slate-500 mt-2 text-right">
                    {msg.timestamp}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="flex items-start gap-3 max-w-xl">
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-3 shadow-lg">
                <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-indigo-300">Autonomous Pipeline Running...</p>
                  <p className="text-[11px] text-slate-400">
                    Multimodal Extraction ➔ pgvector Similarity Search ➔ Corner Case Evaluation
                  </p>
                </div>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Upload Previews bar */}
        {attachedFiles.length > 0 && (
          <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800 flex flex-wrap gap-2">
            {attachedFiles.map((file, idx) => (
              <div
                key={idx}
                className="px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-xs text-indigo-200 flex items-center gap-2"
              >
                {file.type.includes("pdf") ? (
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="truncate max-w-[200px]">{file.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Composer */}
        <div className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 focus-within:border-indigo-500 transition">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".png,.jpg,.jpeg,.pdf"
              multiple
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded-lg transition"
              title="Upload Receipt (PNG, JPG, PDF)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Attach a receipt PDF/image or type instructions..."
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={isProcessing}
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Pane: Collapsible Split-Pane Document Preview */}
      <PdfReceiptSplitViewer
        isOpen={isSplitPreviewOpen}
        onClose={() => setIsSplitPreviewOpen(false)}
        documents={previewDocuments}
        activeIndex={activeDocIndex}
        onSelectIndex={setActiveDocIndex}
      />

      {/* Draft Review Modal */}
      <DraftReviewModal
        isOpen={isDraftModalOpen}
        expense={reviewExpense}
        onClose={() => setIsDraftModalOpen(false)}
        onSubmitToErp={handleSubmitModalToErp}
        onSaveDraftOnly={handleSaveDraftOnly}
      />
    </div>
  );
};
