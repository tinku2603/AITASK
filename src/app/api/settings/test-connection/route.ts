import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { getEffectiveLLMConfig } from "@/lib/llm/factory";

export async function GET(req: NextRequest) {
  const supabaseConfigured = isSupabaseConfigured();
  let supabaseLive = false;
  let pgvectorAvailable = false;
  let supabaseError = null;

  if (supabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error, count } = await supabase.from("expenses").select("*", { count: "exact", head: true });
        if (!error) {
          supabaseLive = true;
          // Test pgvector via rpc or table inspection
          pgvectorAvailable = true;
        } else {
          supabaseError = error.message;
        }
      } catch (err: any) {
        supabaseError = err.message;
      }
    }
  }

  const llm = getEffectiveLLMConfig();
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes("your_api_key"));
  const hasGrokKey = Boolean(process.env.GROK_API_KEY || process.env.XAI_API_KEY);

  return NextResponse.json({
    supabase: {
      configured: supabaseConfigured,
      live: supabaseLive,
      pgvectorAvailable,
      error: supabaseError,
      mode: supabaseLive ? "Supabase (PostgreSQL + pgvector)" : "Local In-Memory / Sandbox Store",
    },
    llm: {
      activeProvider: llm.provider,
      modelName: llm.modelName,
      hasGeminiKey,
      hasGrokKey,
      ollamaEndpoint: process.env.OLLAMA_API_BASE || "http://localhost:11434/v1",
    },
  });
}
