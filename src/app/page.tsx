"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, LayoutDashboard, Sparkles, Layers, Shield } from "lucide-react";
import { Header } from "@/components/Header";
import { ChatInterface } from "@/components/ChatInterface";
import { DashboardTab } from "@/components/DashboardTab";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ProviderSettingsModal } from "@/components/ProviderSettingsModal";
import { LLMProvider, LLMConfig } from "@/lib/llm/factory";
import { StoredConversation } from "@/lib/supabase/client";

export default function Home() {
  const [currentRole, setCurrentRole] = useState<"emp_402" | "mgr_101">("emp_402");
  const [activeTab, setActiveTab] = useState<"chat" | "dashboard">("chat");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<LLMProvider>("gemini");
  const [llmConfigOverride, setLlmConfigOverride] = useState<Partial<LLMConfig>>({
    provider: "gemini",
  });
  const [refreshDashboardTrigger, setRefreshDashboardTrigger] = useState(0);

  // Multi-conversation history state
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("conv_default");

  const loadConversations = async () => {
    // 1. Instant optimistic restore from local cache
    try {
      const cached = localStorage.getItem(`aitask_conv_list_${currentRole}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
          if (!parsed.some((c: any) => c.id === activeConversationId)) {
            setActiveConversationId(parsed[0].id);
          }
        }
      }
    } catch (e) {}

    // 2. Fetch authoritative list from backend / Supabase
    try {
      const res = await fetch(`/api/conversations?userId=${currentRole}`);
      const data = await res.json();
      if (data.conversations && data.conversations.length > 0) {
        setConversations(data.conversations);
        try {
          localStorage.setItem(`aitask_conv_list_${currentRole}`, JSON.stringify(data.conversations));
        } catch (e) {}
        if (!data.conversations.some((c: any) => c.id === activeConversationId)) {
          setActiveConversationId(data.conversations[0].id);
        }
      } else {
        // If empty on backend, create a new conversation session
        const cached = localStorage.getItem(`aitask_conv_list_${currentRole}`);
        if (!cached) {
          handleCreateNewConversation();
        }
      }
    } catch (e) {
      console.error("Failed to load conversations:", e);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [currentRole]);

  const handleCreateNewConversation = async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentRole,
          title: `Claim Session ${new Date().toLocaleDateString()}`,
        }),
      });
      const data = await res.json();
      if (data.conversation) {
        setConversations((prev) => {
          const updated = [data.conversation, ...prev];
          try {
            localStorage.setItem(`aitask_conv_list_${currentRole}`, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        setActiveConversationId(data.conversation.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      const updated = conversations.filter((c) => c.id !== id);
      setConversations(updated);
      try {
        localStorage.setItem(`aitask_conv_list_${currentRole}`, JSON.stringify(updated));
        localStorage.removeItem(`aitask_msgs_${id}`);
      } catch (e) {}

      if (activeConversationId === id) {
        if (updated.length > 0) {
          setActiveConversationId(updated[0].id);
        } else {
          handleCreateNewConversation();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      setConversations((prev) => {
        const updated = prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c));
        try {
          localStorage.setItem(`aitask_conv_list_${currentRole}`, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveConfig = (cfg: { provider: LLMProvider; apiKey?: string; baseURL?: string; modelName?: string }) => {
    setActiveProvider(cfg.provider);
    setLlmConfigOverride(cfg);
  };

  const handleExpenseCreated = () => {
    setRefreshDashboardTrigger((prev) => prev + 1);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950">
      {/* Top Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        activeProvider={activeProvider}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main View Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-16 sm:w-56 border-r border-slate-800 bg-slate-900/50 flex flex-col justify-between p-3 shrink-0">
          <div className="space-y-2">
            <div className="hidden sm:block px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Navigation
            </div>

            {/* Assistant Chat Nav Item */}
            <button
              onClick={() => setActiveTab("chat")}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Assistant Chat</span>
            </button>

            {/* Claims Dashboard Nav Item */}
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === "dashboard"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Claims Dashboard</span>
            </button>
          </div>

          {/* Sidebar Footer Pipeline Info */}
          <div className="hidden sm:block p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] space-y-1 text-slate-400">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Multi-Agent Stack</span>
            </div>
            <p>1. Vision Extraction</p>
            <p>2. pgvector De-duplication</p>
            <p>3. HITL Mediation</p>
            <p>4. ERP Execution</p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex overflow-hidden">
          {activeTab === "chat" ? (
            <div className="flex flex-1 h-full overflow-hidden">
              {/* Conversation History Sidebar */}
              <div className="hidden md:block">
                <ConversationSidebar
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelectConversation={setActiveConversationId}
                  onNewConversation={handleCreateNewConversation}
                  onDeleteConversation={handleDeleteConversation}
                  onRenameConversation={handleRenameConversation}
                />
              </div>

              {/* Chat Interface with Split-Pane PDF preview */}
              <ChatInterface
                userId={currentRole}
                conversationId={activeConversationId}
                llmConfig={llmConfigOverride}
                onExpenseCreated={handleExpenseCreated}
                onConversationUpdated={loadConversations}
              />
            </div>
          ) : (
            <DashboardTab
              currentRole={currentRole}
              refreshTrigger={refreshDashboardTrigger}
            />
          )}
        </main>
      </div>

      {/* Provider & Database Settings Modal */}
      <ProviderSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeProvider={activeProvider}
        onSaveConfig={handleSaveConfig}
      />
    </div>
  );
}
