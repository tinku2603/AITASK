import { runExtractionAgent } from "./extractionAgent";
import { runDeduplicationAgent } from "./deduplicationAgent";
import { createHitlMediationCard } from "./hitlMediator";
import { executeErpClaimSubmission } from "./erpExecutor";
import { saveExpense } from "../supabase/client";
import {
  ExpenseRecord,
  HitlCardPayload,
  DraftCardPayload,
  PipelineEvent,
  DeduplicationResult,
} from "./types";
import { LLMConfig } from "../llm/factory";

export interface PipelineExecutionResult {
  extractedExpenses: ExpenseRecord[];
  events: PipelineEvent[];
  hitlCards: HitlCardPayload[];
  draftCards: DraftCardPayload[];
  submittedExpenses: ExpenseRecord[];
  duplicateWarnings: Array<{
    expense: ExpenseRecord;
    reason: string;
    similarity: number;
  }>;
  summary: string;
}

export async function processExpensePipeline(params: {
  files: Array<{ mimeType: string; base64Data: string }>;
  userPrompt?: string;
  userId?: string;
  autoSubmit?: boolean;
  llmConfig?: Partial<LLMConfig>;
  onStep?: (event: PipelineEvent) => void;
}): Promise<PipelineExecutionResult> {
  const events: PipelineEvent[] = [];
  const hitlCards: HitlCardPayload[] = [];
  const draftCards: DraftCardPayload[] = [];
  const submittedExpenses: ExpenseRecord[] = [];
  const duplicateWarnings: Array<{
    expense: ExpenseRecord;
    reason: string;
    similarity: number;
  }> = [];

  const emit = (step: PipelineEvent["step"], message: string, data?: any) => {
    const event: PipelineEvent = {
      step,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
    events.push(event);
    if (params.onStep) params.onStep(event);
  };

  const userId = params.userId || "emp_402";

  // ----------------------------------------------------
  // STEP 1: Agent 1 - Extraction Specialist
  // ----------------------------------------------------
  emit("EXTRACTING", `Agent 1: Scanning ${params.files.length} document(s) with vision extraction...`);
  
  const extractionOutput = await runExtractionAgent(
    params.files,
    params.userPrompt || "Extract expense receipt details.",
    userId,
    params.llmConfig
  );

  const expenses = extractionOutput.expenses;
  emit("EXTRACTING", `Agent 1: Successfully extracted ${expenses.length} record(s).`, {
    count: expenses.length,
    expenses,
  });

  // ----------------------------------------------------
  // PROCESS EACH EXTRACTED EXPENSE
  // ----------------------------------------------------
  for (let i = 0; i < expenses.length; i++) {
    const expense = expenses[i];
    const itemPrefix = expenses.length > 1 ? `[Item ${i + 1}/${expenses.length}] ` : "";

    // 1. Check Missing Metadata
    const missingFields: string[] = [];
    if (!expense.bill_date) missingFields.push("Bill Date");
    if (expense.total_amount === null || expense.total_amount === undefined) missingFields.push("Total Amount");
    if (!expense.vendor_name) missingFields.push("Vendor Name");

    if (missingFields.length > 0) {
      emit(
        "HITL_TRIGGERED",
        `${itemPrefix}Agent 1 detected missing/obscured metadata (${missingFields.join(", ")}). Halting for human input.`
      );

      const hitlCard = await createHitlMediationCard({
        expense,
        reason: "MISSING_METADATA",
        message: `The receipt is partially obscured. Please provide the missing ${missingFields.join(", ")} to proceed.`,
        missingFields,
      });

      hitlCards.push(hitlCard);
      continue;
    }

    // 2. Mathematical Validation Check
    const lineItems = expense.specific_details?.line_items || [];
    if (lineItems.length > 0 && expense.total_amount !== null) {
      emit("VALIDATING_MATH", `${itemPrefix}Agent 1 verifying mathematical integrity: Sum(Line_Items) == Total...`);
      const sum = lineItems.reduce((acc, curr) => acc + (curr.amount || 0), 0);
      if (Math.abs(sum - expense.total_amount) > 1.0) {
        emit(
          "HITL_TRIGGERED",
          `${itemPrefix}Math mismatch detected: Sum of items (₹${sum.toFixed(2)}) ≠ Stated Total (₹${expense.total_amount.toFixed(2)}).`
        );

        const hitlCard = await createHitlMediationCard({
          expense,
          reason: "MATH_MISMATCH",
          message: `The itemized sum (₹${sum.toFixed(2)}) does not match total amount (₹${expense.total_amount.toFixed(2)}). Please review before submission.`,
        });

        hitlCards.push(hitlCard);
        continue;
      }
    }

    // ----------------------------------------------------
    // STEP 2: Agent 2 - De-duplication Specialist (pgvector)
    // ----------------------------------------------------
    emit("CHECKING_DUPLICATES", `${itemPrefix}Agent 2 generating vector embedding & querying pgvector similarity...`);

    const dedupOutput = await runDeduplicationAgent(
      expense,
      params.llmConfig?.apiKey
    );

    const dedup = dedupOutput.result;

    // Corner Case 1: Round Trip Cab Dilemma Bypass
    if (dedup.status === "ROUND_TRIP_BYPASS") {
      emit(
        "ROUND_TRIP_EVALUATION",
        `${itemPrefix}Agent 2: Round Trip Cab detected! Origin & destination coordinates are inverted. Bypassing duplicate block.`
      );

      if (dedup.remarks_update) {
        expense.remarks = expense.remarks 
          ? `${expense.remarks} | ${dedup.remarks_update}` 
          : dedup.remarks_update;
      }

      if (params.autoSubmit) {
        emit("EXECUTING_ERP", `${itemPrefix}Agent 4: Executing mock ERP submission gateway for verified Round Trip claim...`);
        const erpRes = await executeErpClaimSubmission(expense, dedupOutput.embedding);
        submittedExpenses.push(erpRes.expense);
        emit("COMPLETED", `${itemPrefix}Claim submitted to ERP with status: ${erpRes.status} (Ref: ${erpRes.reference_id})`);
      } else {
        // Save as Draft and provide user choice: View Draft vs Submit Directly
        const draftExpId = expense.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `exp_${Date.now()}`);
        expense.id = draftExpId;
        expense.status = "Draft";
        await saveExpense(expense, dedupOutput.embedding);

        emit("DRAFT_READY", `${itemPrefix}Draft created! You can view & review details or submit directly to ERP.`);
        draftCards.push({
          expense_id: draftExpId,
          expense_data: expense,
          embedding: dedupOutput.embedding,
          remarks_notice: "Verified Round-Trip Cab claim.",
        });
      }
      continue;
    }

    // High Match > 0.95: Definite Duplicate
    if (dedup.status === "DEFINITE_DUPLICATE") {
      emit(
        "FAILED",
        `${itemPrefix}Agent 2 DUPLICATE BLOCKED: Similarity is ${(dedup.highest_similarity * 100).toFixed(1)}% with claim #${(dedup.matched_record?.matched_expense_id || "").slice(0, 8)}. Pipeline terminated.`
      );

      duplicateWarnings.push({
        expense,
        reason: dedup.matched_record?.reason || "Duplicate bill detected in vector database.",
        similarity: dedup.highest_similarity,
      });
      continue;
    }

    // Moderate Match 0.80 - 0.95: Human Override Required
    if (dedup.status === "POTENTIAL_DUPLICATE") {
      emit(
        "HITL_TRIGGERED",
        `${itemPrefix}Agent 2 POTENTIAL DUPLICATE (${(dedup.highest_similarity * 100).toFixed(1)}% match). Halting for user confirmation.`
      );

      const hitlCard = await createHitlMediationCard({
        expense,
        reason: "POTENTIAL_DUPLICATE",
        message: `High similarity (${(dedup.highest_similarity * 100).toFixed(1)}%) with an existing claim (${dedup.matched_record?.matched_vendor}, ₹${dedup.matched_record?.matched_amount}). Is this a unique expense?`,
        conflictingExpense: dedup.matched_record,
        embedding: dedupOutput.embedding,
      });

      hitlCards.push(hitlCard);
      continue;
    }

    // Unique (< 0.80):
    if (params.autoSubmit) {
      emit("EXECUTING_ERP", `${itemPrefix}Agent 4: Similarity < 0.80 (unique claim). Calling Enterprise ERP Gateway...`);
      const erpRes = await executeErpClaimSubmission(expense, dedupOutput.embedding);
      submittedExpenses.push(erpRes.expense);
      emit("COMPLETED", `${itemPrefix}Claim #${(erpRes.expense.id || "").slice(0, 8)} successfully submitted to ERP (Status: Pending Approval).`);
    } else {
      // Save as Draft in Supabase/store and give user the choice to Review Draft or Submit Directly
      const draftExpId = expense.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `exp_${Date.now()}`);
      expense.id = draftExpId;
      expense.status = "Draft";
      await saveExpense(expense, dedupOutput.embedding);

      emit("DRAFT_READY", `${itemPrefix}Draft created! Review before submission or submit directly to ERP.`);
      draftCards.push({
        expense_id: draftExpId,
        expense_data: expense,
        embedding: dedupOutput.embedding,
      });
    }
  }

  // Summary message
  let summary = `Pipeline finished: ${expenses.length} expense(s) evaluated.`;
  if (draftCards.length > 0) {
    summary += ` ${draftCards.length} draft claim(s) ready for review or instant submission.`;
  }
  if (submittedExpenses.length > 0) {
    summary += ` ${submittedExpenses.length} claim(s) routed to ERP Pending Approval.`;
  }
  if (hitlCards.length > 0) {
    summary += ` ${hitlCards.length} item(s) require human review.`;
  }
  if (duplicateWarnings.length > 0) {
    summary += ` ${duplicateWarnings.length} duplicate bill(s) were blocked.`;
  }

  return {
    extractedExpenses: expenses,
    events,
    hitlCards,
    draftCards,
    submittedExpenses,
    duplicateWarnings,
    summary,
  };
}
