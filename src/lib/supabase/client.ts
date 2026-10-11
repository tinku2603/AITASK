import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ExpenseRecord } from "../agents/types";
import { calculateCosineSimilarity } from "../llm/embeddings";

// Interface for database expense row
export interface StoredExpenseRow {
  id: string;
  user_id: string;
  bill_type: string;
  bill_date: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  currency: string;
  payment_mode?: string | null;
  remarks?: string | null;
  specific_details?: any;
  status: string;
  embedding?: number[] | null;
  created_at: string;
  updated_at?: string;
}

// Global scope attachment to preserve state across Next.js dev server worker threads & reloads
interface GlobalAppState {
  __memoryExpenses?: Map<string, StoredExpenseRow>;
  __memoryConversations?: Map<string, StoredConversation>;
  __memoryChatMessages?: Map<string, StoredChatMessage[]>;
}

const globalStore = globalThis as unknown as GlobalAppState;

function getInitialMockExpenses(): Map<string, StoredExpenseRow> {
  return new Map([
    [
      "11111111-1111-1111-1111-111111111111",
      {
        id: "11111111-1111-1111-1111-111111111111",
        user_id: "emp_402",
        bill_type: "CAB_LOCAL",
        bill_date: new Date().toISOString().split("T")[0],
        vendor_name: "Uber India",
        total_amount: 450.0,
        currency: "INR",
        payment_mode: "UPI",
        remarks: "Client visit outbound",
        specific_details: {
          from_place: "Koramangala Office",
          to_place: "Whitefield Tech Park",
          line_items: [{ description: "Uber Go Ride", amount: 450.0 }],
        },
        status: "Pending Approval",
        created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
    ],
    [
      "22222222-2222-2222-2222-222222222222",
      {
        id: "22222222-2222-2222-2222-222222222222",
        user_id: "emp_402",
        bill_type: "FOOD",
        bill_date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
        vendor_name: "Third Wave Coffee",
        total_amount: 380.0,
        currency: "INR",
        payment_mode: "UPI",
        remarks: "Team sync refreshment",
        specific_details: {
          line_items: [
            { description: "Cold Brew", amount: 220.0 },
            { description: "Croissant", amount: 160.0 },
          ],
        },
        status: "Settlement Processing",
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    [
      "33333333-3333-3333-3333-333333333333",
      {
        id: "33333333-3333-3333-3333-333333333333",
        user_id: "emp_402",
        bill_type: "FUEL",
        bill_date: new Date(Date.now() - 86400000 * 3).toISOString().split("T")[0],
        vendor_name: "Shell Petrol Station",
        total_amount: 2500.0,
        currency: "INR",
        payment_mode: "Corporate Card",
        remarks: "Field visit fuel",
        specific_details: {
          fuel_liters: 24.5,
          fuel_type: "Petrol",
        },
        status: "Paid",
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
    ],
  ]);
}

if (!globalStore.__memoryExpenses) {
  globalStore.__memoryExpenses = getInitialMockExpenses();
}
const memoryExpenses: Map<string, StoredExpenseRow> = globalStore.__memoryExpenses;

export interface StoredConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface StoredChatMessage {
  id: string;
  conversation_id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  files?: Array<{ name: string; type: string; base64?: string }>;
  events?: any[];
  hitl_cards?: any[];
  draft_cards?: any[];
  created_at: string;
}

if (!globalStore.__memoryConversations) {
  globalStore.__memoryConversations = new Map([
    [
      "conv_default",
      {
        id: "conv_default",
        user_id: "emp_402",
        title: "Current Expense Session",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  ]);
}
const memoryConversations: Map<string, StoredConversation> = globalStore.__memoryConversations;

if (!globalStore.__memoryChatMessages) {
  globalStore.__memoryChatMessages = new Map();
}
const memoryChatMessages: Map<string, StoredChatMessage[]> = globalStore.__memoryChatMessages;

// Helper to sanitize check constraints matching Supabase schema
export function normalizeBillType(rawType?: string | null): string {
  if (!rawType) return "OTHER";
  const upper = rawType.toUpperCase().trim();
  if (["CAB_LOCAL", "FUEL", "FOOD", "FLIGHT", "HOTEL", "OTHER"].includes(upper)) {
    return upper;
  }
  if (upper.includes("CAB") || upper.includes("TAXI") || upper.includes("UBER") || upper.includes("OLA")) {
    return "CAB_LOCAL";
  }
  if (upper.includes("FUEL") || upper.includes("PETROL") || upper.includes("DIESEL") || upper.includes("GAS")) {
    return "FUEL";
  }
  if (
    upper.includes("FOOD") ||
    upper.includes("MEAL") ||
    upper.includes("DINNER") ||
    upper.includes("LUNCH") ||
    upper.includes("CAFE") ||
    upper.includes("RESTAURANT")
  ) {
    return "FOOD";
  }
  if (upper.includes("FLIGHT") || upper.includes("AIR")) {
    return "FLIGHT";
  }
  if (upper.includes("HOTEL") || upper.includes("STAY") || upper.includes("LODGING")) {
    return "HOTEL";
  }
  return "OTHER";
}

export function normalizeStatus(rawStatus?: string | null): string {
  if (!rawStatus) return "Draft";
  const s = rawStatus.trim();
  if (["Draft", "Awaiting User Input", "Pending Approval", "Settlement Processing", "Paid", "Rejected"].includes(s)) {
    return s;
  }
  if (s.toLowerCase().includes("pending") || s.toLowerCase().includes("submit")) {
    return "Pending Approval";
  }
  if (s.toLowerCase().includes("settl") || s.toLowerCase().includes("process")) {
    return "Settlement Processing";
  }
  if (s.toLowerCase().includes("paid") || s.toLowerCase().includes("approve")) {
    return "Paid";
  }
  if (s.toLowerCase().includes("reject") || s.toLowerCase().includes("discard")) {
    return "Rejected";
  }
  if (s.toLowerCase().includes("await") || s.toLowerCase().includes("input")) {
    return "Awaiting User Input";
  }
  return "Draft";
}

export function normalizeBillDate(rawDate?: string | null): string {
  if (!rawDate) return new Date().toISOString().split("T")[0];
  const str = String(rawDate).trim();
  if (str.includes("T")) return str.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return new Date().toISOString().split("T")[0];
}

/**
 * Returns a valid PostgREST API key for Supabase client.
 * Note: Personal Access Tokens starting with 'sbp_' are for Supabase CLI/Management API
 * and cause PostgREST 401 'Invalid API key' errors if passed as client apikey.
 */
function getValidSupabaseKey(): string | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // If serviceKey starts with sbp_ or contains placeholder, bypass it
  if (serviceKey && !serviceKey.startsWith("sbp_") && !serviceKey.includes("placeholder") && serviceKey.trim().length > 10) {
    return serviceKey.trim();
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (anonKey && !anonKey.includes("placeholder") && anonKey.trim().length > 10) {
    return anonKey.trim();
  }
  return null;
}

let cachedSupabase: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = getValidSupabaseKey();
  return Boolean(url && key && !url.includes("placeholder") && !url.includes("your-supabase-url"));
}

export function getSupabase(): SupabaseClient | null {
  if (cachedSupabase) return cachedSupabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = getValidSupabaseKey();

  if (url && key && !url.includes("placeholder")) {
    try {
      cachedSupabase = createClient(url, key);
      return cachedSupabase;
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
    }
  }
  return null;
}

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ------------------------------------------------------------------
// High-level Repository Functions
// ------------------------------------------------------------------

export async function fetchExpenses(userId?: string): Promise<StoredExpenseRow[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      let query = supabase.from("expenses").select("*").order("created_at", { ascending: false });
      if (userId && userId !== "ALL") {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query;
      if (!error && data) {
        // Merge with memory map to guarantee zero latency on newly submitted items
        const dbIds = new Set(data.map((d: any) => d.id));
        const extraMemory = Array.from(memoryExpenses.values()).filter(
          (m) => !dbIds.has(m.id) && (!userId || userId === "ALL" || m.user_id === userId)
        );
        return [...data, ...extraMemory].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ) as StoredExpenseRow[];
      }
      console.warn("Supabase fetch warning, falling back to memory store:", error?.message);
    } catch (err: any) {
      console.warn("Supabase query exception:", err.message);
    }
  }

  // Memory fallback
  const all = Array.from(memoryExpenses.values());
  const filtered = userId && userId !== "ALL" ? all.filter((e) => e.user_id === userId) : all;
  return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function fetchExpenseById(id: string): Promise<StoredExpenseRow | null> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase.from("expenses").select("*").eq("id", id).single();
      if (!error && data) return data as StoredExpenseRow;
    } catch (e) {
      // fallback
    }
  }
  return memoryExpenses.get(id) || null;
}

export async function saveExpense(
  expense: Partial<StoredExpenseRow>,
  embedding?: number[]
): Promise<StoredExpenseRow> {
  const id = expense.id && expense.id.length > 5 ? expense.id : generateUUID();
  const now = new Date().toISOString();

  // Ensure embedding is null if empty array so pgvector doesn't reject it
  const validEmbedding = embedding && embedding.length > 0 ? embedding : null;

  const record: StoredExpenseRow = {
    id,
    user_id: expense.user_id || "emp_402",
    bill_type: normalizeBillType(expense.bill_type),
    bill_date: normalizeBillDate(expense.bill_date),
    vendor_name: expense.vendor_name || "Unknown Vendor",
    total_amount: Number(expense.total_amount) || 0,
    currency: expense.currency || "INR",
    payment_mode: expense.payment_mode || "UPI",
    remarks: expense.remarks || "",
    specific_details: expense.specific_details || {},
    status: normalizeStatus(expense.status),
    embedding: validEmbedding,
    created_at: expense.created_at || now,
    updated_at: now,
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.from("expenses").upsert(record);
      if (error) {
        console.warn("Supabase upsert warning, keeping in memory store:", error.message);
      }
    } catch (err: any) {
      console.warn("Supabase save exception:", err.message);
    }
  }

  memoryExpenses.set(id, record);
  return record;
}

export async function updateExpense(
  id: string,
  updates: Partial<StoredExpenseRow>
): Promise<StoredExpenseRow | null> {
  const existing = await fetchExpenseById(id);
  const now = new Date().toISOString();

  const updated: StoredExpenseRow = {
    ...(existing || {
      id,
      user_id: updates.user_id || "emp_402",
      bill_type: "OTHER",
      bill_date: now.split("T")[0],
      vendor_name: "Expense",
      total_amount: 0,
      currency: "INR",
      status: "Pending Approval",
      created_at: now,
    }),
    ...updates,
    bill_type: updates.bill_type ? normalizeBillType(updates.bill_type) : existing?.bill_type || "OTHER",
    status: updates.status ? normalizeStatus(updates.status) : existing?.status || "Draft",
    bill_date: updates.bill_date ? normalizeBillDate(updates.bill_date) : existing?.bill_date || now.split("T")[0],
    updated_at: now,
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.from("expenses").upsert(updated);
      if (error) {
        console.warn("Supabase update error:", error.message);
      }
    } catch (e) {
      console.warn("Supabase update exception:", e);
    }
  }

  memoryExpenses.set(id, updated);
  return updated;
}

export async function deleteExpense(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("expenses").delete().eq("id", id);
    } catch (e) {
      console.warn("Supabase delete error:", e);
    }
  }

  memoryExpenses.delete(id);
  return true;
}

/**
 * Similarity match against existing expenses using pgvector RPC or fallback vector matching
 */
export async function matchExistingExpenses(
  queryEmbedding: number[],
  userId: string,
  billDate: string,
  threshold = 0.70
): Promise<Array<StoredExpenseRow & { similarity: number }>> {
  const supabase = getSupabase();

  if (supabase) {
    try {
      // 1. Try Supabase match_expenses RPC function defined in schema.sql
      const { data, error } = await supabase.rpc("match_expenses", {
        query_embedding: queryEmbedding,
        filter_user_id: userId,
        filter_bill_date: billDate,
        match_threshold: threshold,
        match_count: 5,
      });

      if (!error && data && Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => ({
          ...item,
          similarity: Number(item.similarity) || 0,
        }));
      }
    } catch (err: any) {
      console.warn("Supabase RPC match_expenses error:", err.message);
    }

    // 2. If RPC is not created yet, query Supabase expenses table directly by exact metadata
    try {
      const { data: dbRows, error: dbErr } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", userId)
        .eq("bill_date", billDate);

      if (!dbErr && dbRows && dbRows.length > 0) {
        const matches: Array<StoredExpenseRow & { similarity: number }> = [];
        for (const exp of dbRows) {
          let sim = 0;
          if (exp.embedding && Array.isArray(exp.embedding) && exp.embedding.length === queryEmbedding.length) {
            sim = calculateCosineSimilarity(queryEmbedding, exp.embedding);
          } else {
            const safeVendor = (exp.vendor_name || "").toLowerCase();
            sim = safeVendor ? 0.95 : 0.5;
          }
          if (sim >= threshold) {
            matches.push({ ...exp, similarity: sim });
          }
        }
        if (matches.length > 0) {
          return matches.sort((a, b) => b.similarity - a.similarity);
        }
      }
    } catch (e) {
      // fallback to memory
    }
  }

  // 3. Fallback in-memory vector similarity calculation with metadata match
  const matches: Array<StoredExpenseRow & { similarity: number }> = [];

  for (const exp of memoryExpenses.values()) {
    if (exp.user_id === userId && exp.bill_date === billDate) {
      let sim = 0;
      if (exp.embedding && exp.embedding.length === queryEmbedding.length) {
        sim = calculateCosineSimilarity(queryEmbedding, exp.embedding);
      } else {
        const safeVendor = (exp.vendor_name || "").toLowerCase();
        sim = safeVendor ? 0.95 : 0.5;
      }

      if (sim >= threshold) {
        matches.push({
          ...exp,
          similarity: sim,
        });
      }
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}

// ------------------------------------------------------------------
// Conversations & Chat History Storage
// ------------------------------------------------------------------

export async function fetchConversations(userId = "emp_402"): Promise<StoredConversation[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (!error && data && data.length > 0) {
        return data as StoredConversation[];
      }
    } catch (e) {
      // fallback
    }
  }

  const all = Array.from(memoryConversations.values()).filter((c) => c.user_id === userId);
  return all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function createConversation(userId = "emp_402", title = "New Conversation"): Promise<StoredConversation> {
  const id = generateUUID();
  const now = new Date().toISOString();
  const conv: StoredConversation = {
    id,
    user_id: userId,
    title,
    created_at: now,
    updated_at: now,
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.from("conversations").insert(conv);
      if (error) {
        console.warn("Supabase conversations insert warning:", error.message);
      }
    } catch (e) {
      console.warn("Supabase conversation save exception:", e);
    }
  }

  memoryConversations.set(id, conv);
  return conv;
}

export async function deleteConversation(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("conversations").delete().eq("id", id);
    } catch (e) {
      // fallback
    }
  }

  memoryConversations.delete(id);
  memoryChatMessages.delete(id);
  return true;
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  const conv = memoryConversations.get(id);
  const now = new Date().toISOString();
  if (conv) {
    conv.title = title;
    conv.updated_at = now;
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("conversations").update({ title, updated_at: now }).eq("id", id);
    } catch (e) {
      // fallback
    }
  }
}

export async function fetchChatMessages(conversationId: string): Promise<StoredChatMessage[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        return data as StoredChatMessage[];
      }
    } catch (e) {
      // fallback
    }
  }

  return memoryChatMessages.get(conversationId) || [];
}

export async function saveChatMessage(msg: Partial<StoredChatMessage>): Promise<StoredChatMessage> {
  const id = msg.id || generateUUID();
  const now = new Date().toISOString();
  const conversationId = msg.conversation_id || "conv_default";

  const messageRecord: StoredChatMessage = {
    id,
    conversation_id: conversationId,
    sender: msg.sender || "user",
    text: msg.text || "",
    files: msg.files || [],
    events: msg.events || [],
    hitl_cards: msg.hitl_cards || [],
    draft_cards: msg.draft_cards || [],
    created_at: msg.created_at || now,
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      // Ensure conversation row exists in Supabase so foreign key constraint never fails
      await supabase.from("conversations").upsert({
        id: conversationId,
        user_id: "emp_402",
        title: "Claim Session",
        updated_at: now,
      });

      const { error } = await supabase.from("chat_messages").insert(messageRecord);
      if (error) {
        console.warn("Supabase chat_messages insert error:", error.message);
      }
    } catch (e) {
      console.warn("Supabase chat save exception:", e);
    }
  }

  const existingList = memoryChatMessages.get(conversationId) || [];
  existingList.push(messageRecord);
  memoryChatMessages.set(conversationId, existingList);

  const conv = memoryConversations.get(conversationId);
  if (conv) conv.updated_at = now;

  return messageRecord;
}
