import { callVisionLLM, LLMConfig } from "../llm/factory";
import {
  ExtractionResult,
  ExtractionResultSchema,
  StandardizedExpenseSchema,
  ExpenseRecord,
} from "./types";

const EXTRACTION_SYSTEM_PROMPT = `
You are the Extraction Specialist Agent in an autonomous corporate expense reimbursement system.
Your job is to parse scanned receipts, invoices, bills, and payment screenshots into structured JSON.

MANDATORY RULES:
1. Output MUST be valid JSON adhering to this schema:
   {
     "expenses": [
       {
         "bill_type": "CAB_LOCAL" | "FUEL" | "FOOD" | "FLIGHT" | "HOTEL" | "OTHER",
         "bill_date": "YYYY-MM-DD" or null if missing/illegible,
         "vendor_name": string or null if illegible,
         "total_amount": number (float/int) or null if missing,
         "currency": string (e.g. "INR", "USD"),
         "payment_mode": string (e.g. "UPI", "Cash", "Card"),
         "remarks": string,
         "specific_details": {
           "from_place": string (for CAB/FLIGHT),
           "to_place": string (for CAB/FLIGHT),
           "fuel_liters": number,
           "fuel_type": string,
           "restaurant_name": string,
           "flight_pnr": string,
           "line_items": [
             { "description": string, "quantity": number, "unit_price": number, "amount": number }
           ]
         }
       }
     ],
     "raw_reasoning": string,
     "page_count": number
   }

2. MULTI-PAGE & GROUPED DOCUMENTS:
   If the document contains multiple distinct receipts or invoices (e.g., flight ticket on Page 1, lunch receipt on Page 2),
   you MUST return multiple objects inside the "expenses" array, one for each distinct invoice/bill.

3. MATHEMATICAL INTEGRITY:
   Calculate each line item. Ensure that sum of line_items amount equals total_amount.
   If subtotal + taxes = total, include tax as a line item if appropriate, or ensure sum(line_items) equals the stated total.

4. MISSING METADATA:
   If merchant title or date or total amount is obscured, cut off, or blurry, set the respective field to null.
   Do NOT hallucinate or guess.

Output ONLY raw JSON. No markdown ticks, no preamble.
`;

export async function runExtractionAgent(
  files: Array<{ mimeType: string; base64Data: string }>,
  userPrompt = "Extract expense details from the attached receipt document.",
  userId = "emp_402",
  llmConfig?: Partial<LLMConfig>
): Promise<{
  expenses: ExpenseRecord[];
  rawReasoning?: string;
  hasMissingMetadata: boolean;
  hasMathMismatch: boolean;
}> {
  const rawResponse = await callVisionLLM(
    {
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      files,
    },
    llmConfig
  );

  let parsed: any;
  try {
    // Clean potential markdown ticks
    const cleanJson = rawResponse
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    console.warn("Failed to parse JSON directly from LLM, attempting regex recovery", rawResponse);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Extraction Specialist failed to return valid JSON: " + rawResponse);
    }
  }

  // Normalize into expenses array
  let expenseList: any[] = [];
  if (Array.isArray(parsed.expenses)) {
    expenseList = parsed.expenses;
  } else if (parsed.vendor_name || parsed.total_amount) {
    expenseList = [parsed];
  } else {
    expenseList = [];
  }

  const finalizedExpenses: ExpenseRecord[] = [];
  let hasMissingMetadata = false;
  let hasMathMismatch = false;

  for (const item of expenseList) {
    const billDate = item.bill_date ? String(item.bill_date).trim() : null;
    const totalAmount = item.total_amount !== null && item.total_amount !== undefined ? Number(item.total_amount) : null;
    const vendorName = item.vendor_name ? String(item.vendor_name).trim() : null;

    // Check missing metadata corner case
    const isMissingMeta = !billDate || totalAmount === null || !vendorName;
    if (isMissingMeta) {
      hasMissingMetadata = true;
    }

    // Mathematical validation: Sum(line_items) == total_amount
    const lineItems = item.specific_details?.line_items || [];
    let mathError = false;
    if (Array.isArray(lineItems) && lineItems.length > 0 && totalAmount !== null) {
      const lineItemSum = lineItems.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
      const diff = Math.abs(lineItemSum - totalAmount);
      // Tolerance of 1 currency unit for rounding/decimal differences
      if (diff > 1.0) {
        mathError = true;
        hasMathMismatch = true;
      }
    }

    const validationErrors: string[] = [];
    if (isMissingMeta) validationErrors.push("Vital metadata (vendor, date, or total) missing or unreadable.");
    if (mathError) validationErrors.push("Mathematical validation mismatch: Sum of line items does not equal total amount.");

    const expense: ExpenseRecord = {
      id: item.id,
      user_id: userId,
      bill_type: item.bill_type || "OTHER",
      bill_date: billDate,
      vendor_name: vendorName,
      total_amount: totalAmount,
      currency: item.currency || "INR",
      payment_mode: item.payment_mode || "UPI",
      remarks: item.remarks || "",
      specific_details: {
        from_place: item.specific_details?.from_place || null,
        to_place: item.specific_details?.to_place || null,
        fuel_liters: item.specific_details?.fuel_liters || null,
        fuel_type: item.specific_details?.fuel_type || null,
        restaurant_name: item.specific_details?.restaurant_name || null,
        flight_pnr: item.specific_details?.flight_pnr || null,
        line_items: lineItems.map((li: any) => ({
          description: li.description || "Item",
          quantity: Number(li.quantity) || 1,
          unit_price: li.unit_price ? Number(li.unit_price) : undefined,
          amount: Number(li.amount) || 0,
        })),
      },
      status: isMissingMeta || mathError ? "Awaiting User Input" : "Draft",
      confidence_score: isMissingMeta ? 0.6 : mathError ? 0.8 : 0.98,
      validation_errors: validationErrors,
    };

    finalizedExpenses.push(expense);
  }

  return {
    expenses: finalizedExpenses,
    rawReasoning: parsed.raw_reasoning,
    hasMissingMetadata,
    hasMathMismatch,
  };
}
