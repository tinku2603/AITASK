import { NextRequest, NextResponse } from "next/server";
import { processExpensePipeline } from "@/lib/agents/orchestrator";
import { LLMConfig } from "@/lib/llm/factory";
import { saveChatMessage, updateConversationTitle } from "@/lib/supabase/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { files, message, userId, llmConfig, conversationId, autoSubmit } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        {
          error: "No file attachments found. Please upload a receipt image (PNG, JPG) or invoice PDF.",
        },
        { status: 400 }
      );
    }

    const currentConvId = conversationId || "conv_default";

    // 1. Save user's incoming message
    await saveChatMessage({
      conversation_id: currentConvId,
      sender: "user",
      text: message || "Uploaded receipt document(s).",
      files: files.map((f: any) => ({
        name: f.name || "receipt_document",
        type: f.mimeType || "image/png",
        base64: f.base64Data, // Persist for split-pane PDF/image preview
      })),
    });

    // 2. Run autonomous multi-agent pipeline
    const pipelineResult = await processExpensePipeline({
      files,
      userPrompt: message || "Extract expense receipt details and process claim.",
      userId: userId || "emp_402",
      autoSubmit: Boolean(autoSubmit),
      llmConfig: llmConfig as Partial<LLMConfig>,
    });

    // 3. Save assistant's response to history
    await saveChatMessage({
      conversation_id: currentConvId,
      sender: "assistant",
      text: pipelineResult.summary,
      events: pipelineResult.events,
      hitl_cards: pipelineResult.hitlCards,
      draft_cards: pipelineResult.draftCards,
    });

    // 4. Intelligently update conversation title if first upload
    if (pipelineResult.extractedExpenses.length > 0) {
      const firstExp = pipelineResult.extractedExpenses[0];
      const newTitle = `${firstExp.vendor_name || "Claim"} - ₹${firstExp.total_amount || 0}`;
      await updateConversationTitle(currentConvId, newTitle);
    }

    return NextResponse.json({
      success: true,
      result: pipelineResult,
    });
  } catch (error: any) {
    console.error("Agent chat pipeline error:", error);
    return NextResponse.json(
      {
        error: error.message || "An unexpected error occurred in the agentic pipeline.",
      },
      { status: 500 }
    );
  }
}
