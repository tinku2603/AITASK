import { ExpenseRecord, DeduplicationResult, DeduplicationStatus } from "./types";
import { generateExpenseEmbedding } from "../llm/embeddings";
import { matchExistingExpenses, StoredExpenseRow } from "../supabase/client";

export function buildExpenseContextString(expense: ExpenseRecord): string {
  return `Vendor: ${expense.vendor_name || "Unknown"} | Date: ${expense.bill_date || "Unknown"} | Amount: ${expense.total_amount || 0}`;
}

export async function runDeduplicationAgent(
  expense: ExpenseRecord,
  apiKey?: string
): Promise<{
  result: DeduplicationResult;
  embedding: number[];
  contextString: string;
}> {
  // If vital metadata is missing, we cannot construct a valid de-dup vector
  if (!expense.bill_date || expense.total_amount === null || !expense.vendor_name) {
    return {
      result: {
        status: "UNIQUE", // Will be caught by HITL for missing metadata
        highest_similarity: 0,
      },
      embedding: [],
      contextString: "",
    };
  }

  const contextString = buildExpenseContextString(expense);
  const embedding = await generateExpenseEmbedding(contextString, apiKey);

  // Absolute metadata filter query: user_id and bill_date
  const matches = await matchExistingExpenses(
    embedding,
    expense.user_id,
    expense.bill_date,
    0.70 // Retrieve matches with >= 70% similarity
  );

  if (!matches || matches.length === 0) {
    return {
      result: {
        status: "UNIQUE",
        highest_similarity: 0,
      },
      embedding,
      contextString,
    };
  }

  const topMatch = matches[0];
  const sim = topMatch.similarity;

  // CORNER CASE 1: The "Round Trip Cab" Dilemma
  // If similarity > 0.95 or bill is Cab/Ride, check if from_place and to_place are inverted
  const isCab = 
    expense.bill_type === "CAB_LOCAL" || 
    (expense.vendor_name && /uber|ola|rapido|lyft|cab|taxi/i.test(expense.vendor_name));

  if (isCab && sim >= 0.85) {
    const newFrom = expense.specific_details?.from_place?.toLowerCase().trim();
    const newTo = expense.specific_details?.to_place?.toLowerCase().trim();
    const existingFrom = topMatch.specific_details?.from_place?.toLowerCase().trim();
    const existingTo = topMatch.specific_details?.to_place?.toLowerCase().trim();

    const isInvertedRoute =
      newFrom &&
      newTo &&
      existingFrom &&
      existingTo &&
      newFrom === existingTo &&
      newTo === existingFrom;

    if (isInvertedRoute) {
      return {
        result: {
          status: "ROUND_TRIP_BYPASS",
          highest_similarity: sim,
          matched_record: {
            matched_expense_id: topMatch.id,
            matched_vendor: topMatch.vendor_name || "Unknown Vendor",
            matched_amount: Number(topMatch.total_amount) || 0,
            matched_date: topMatch.bill_date || "",
            similarity_score: sim,
            reason: `Opposing route detected (${newFrom} ➔ ${newTo} vs ${existingFrom} ➔ ${existingTo}). Legitimate return trip.`,
          },
          remarks_update: `Round Trip verified: Inverted route from ${topMatch.vendor_name || "cab"} earlier claim (#${topMatch.id.slice(0, 8)}).`,
        },
        embedding,
        contextString,
      };
    }
  }

  // STANDARD ROUTING LOGIC
  // Similarity > 0.95: Definite duplicate
  if (sim >= 0.95) {
    return {
      result: {
        status: "DEFINITE_DUPLICATE",
        highest_similarity: sim,
        matched_record: {
          matched_expense_id: topMatch.id,
          matched_vendor: topMatch.vendor_name || "Unknown Vendor",
          matched_amount: Number(topMatch.total_amount) || 0,
          matched_date: topMatch.bill_date || "",
          similarity_score: sim,
          reason: `Exact or near-identical claim found on ${topMatch.bill_date} for ${topMatch.vendor_name} (₹${topMatch.total_amount}).`,
        },
      },
      embedding,
      contextString,
    };
  }

  // Similarity 0.80 - 0.95: Human Override Required
  if (sim >= 0.80) {
    return {
      result: {
        status: "POTENTIAL_DUPLICATE",
        highest_similarity: sim,
        matched_record: {
          matched_expense_id: topMatch.id,
          matched_vendor: topMatch.vendor_name || "Unknown Vendor",
          matched_amount: Number(topMatch.total_amount) || 0,
          matched_date: topMatch.bill_date || "",
          similarity_score: sim,
          reason: `High similarity (${(sim * 100).toFixed(1)}%) with claim #${topMatch.id.slice(0, 8)} (${topMatch.vendor_name}, ₹${topMatch.total_amount}).`,
        },
      },
      embedding,
      contextString,
    };
  }

  // Similarity < 0.80: Unique -> Proceed to Agent 4
  return {
    result: {
      status: "UNIQUE",
      highest_similarity: sim,
    },
    embedding,
    contextString,
  };
}
