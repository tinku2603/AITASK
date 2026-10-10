import { ExpenseRecord } from "./types";
import { saveExpense, updateExpense } from "../supabase/client";

export interface ErpSubmissionResponse {
  success: boolean;
  reference_id: string;
  status: "Pending Approval";
  erp_timestamp: string;
  message: string;
  expense: ExpenseRecord;
}

export async function executeErpClaimSubmission(
  expense: ExpenseRecord,
  embedding?: number[]
): Promise<ErpSubmissionResponse> {
  const expenseId = expense.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `exp_${Date.now()}`);
  const referenceId = `ERP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const now = new Date().toISOString();

  const finalExpense: ExpenseRecord = {
    ...expense,
    id: expenseId,
    status: "Pending Approval",
    remarks: expense.remarks ? `${expense.remarks} [Ref: ${referenceId}]` : `Submitted via Agentic Gateway [Ref: ${referenceId}]`,
  };

  // Commit payload data directly to Supabase table
  await saveExpense(finalExpense, embedding);

  return {
    success: true,
    reference_id: referenceId,
    status: "Pending Approval",
    erp_timestamp: now,
    message: `Claim successfully submitted to Enterprise ERP Gateway with ID ${referenceId}`,
    expense: finalExpense,
  };
}
