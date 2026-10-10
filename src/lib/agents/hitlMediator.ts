import { ExpenseRecord, HitlCardPayload, DeduplicationMatch } from "./types";
import { saveExpense } from "../supabase/client";

export async function createHitlMediationCard(params: {
  expense: ExpenseRecord;
  reason: "POTENTIAL_DUPLICATE" | "MISSING_METADATA" | "MATH_MISMATCH";
  message: string;
  conflictingExpense?: DeduplicationMatch;
  missingFields?: string[];
  embedding?: number[];
}): Promise<HitlCardPayload> {
  const expenseId = params.expense.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `exp_${Date.now()}`);
  
  // Update status to 'Awaiting User Input' in Supabase/Store
  const draftExpense: ExpenseRecord = {
    ...params.expense,
    id: expenseId,
    status: "Awaiting User Input",
  };

  await saveExpense(draftExpense, params.embedding);

  return {
    expense_id: expenseId,
    expense_data: draftExpense,
    reason: params.reason,
    message: params.message,
    similarity_score: params.conflictingExpense?.similarity_score,
    conflicting_expense: params.conflictingExpense,
    missing_fields: params.missingFields,
  };
}
