import { z } from "zod";

// 1. Line Item Schema
export const LineItemSchema = z.object({
  description: z.string().default("Line Item"),
  quantity: z.number().optional().default(1),
  unit_price: z.number().optional(),
  amount: z.number(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

// 2. Specific Details per Bill Type
export const SpecificDetailsSchema = z.object({
  from_place: z.string().optional().nullable(),
  to_place: z.string().optional().nullable(),
  distance_km: z.number().optional().nullable(),
  ride_tier: z.string().optional().nullable(),
  fuel_liters: z.number().optional().nullable(),
  fuel_type: z.string().optional().nullable(),
  attendees: z.array(z.string()).optional().nullable(),
  restaurant_name: z.string().optional().nullable(),
  hotel_nights: z.number().optional().nullable(),
  flight_pnr: z.string().optional().nullable(),
  line_items: z.array(LineItemSchema).optional().default([]),
});

export type SpecificDetails = z.infer<typeof SpecificDetailsSchema>;

// 3. Standardized Expense Extraction Schema
export const StandardizedExpenseSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().default("emp_402"),
  bill_type: z.enum(["CAB_LOCAL", "FUEL", "FOOD", "FLIGHT", "HOTEL", "OTHER"]).default("OTHER"),
  bill_date: z.string().nullable(), // YYYY-MM-DD or null if missing/blurred
  vendor_name: z.string().nullable(),
  total_amount: z.number().nullable(),
  currency: z.string().default("INR"),
  payment_mode: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  specific_details: SpecificDetailsSchema.default({}),
  status: z.enum([
    "Draft",
    "Awaiting User Input",
    "Pending Approval",
    "Settlement Processing",
    "Paid",
    "Rejected",
  ]).default("Draft"),
  confidence_score: z.number().optional().default(1.0),
  validation_errors: z.array(z.string()).optional().default([]),
});

export type ExpenseRecord = z.infer<typeof StandardizedExpenseSchema>;

// 4. Extraction Agent Output (Supports single or multi-page array)
export const ExtractionResultSchema = z.object({
  expenses: z.array(StandardizedExpenseSchema),
  raw_reasoning: z.string().optional(),
  page_count: z.number().optional().default(1),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// 5. De-duplication Result (Agent 2)
export type DeduplicationStatus = 
  | "UNIQUE"                     // Similarity < 0.80 -> go to Agent 4
  | "POTENTIAL_DUPLICATE"        // Similarity 0.80 - 0.95 -> HITL Agent 3
  | "DEFINITE_DUPLICATE"         // Similarity > 0.95 -> terminated with warning
  | "ROUND_TRIP_BYPASS";         // Uber/cab round-trip inverse detected -> bypass duplicate and mark

export interface DeduplicationMatch {
  matched_expense_id: string;
  matched_vendor: string;
  matched_amount: number;
  matched_date: string;
  similarity_score: number;
  reason: string;
}

export interface DeduplicationResult {
  status: DeduplicationStatus;
  highest_similarity: number;
  matched_record?: DeduplicationMatch;
  remarks_update?: string;
}

// 6. HITL Action Payload (Agent 3)
export interface HitlCardPayload {
  expense_id: string;
  expense_data: ExpenseRecord;
  reason: "POTENTIAL_DUPLICATE" | "MISSING_METADATA" | "MATH_MISMATCH";
  message: string;
  similarity_score?: number;
  conflicting_expense?: DeduplicationMatch;
  missing_fields?: string[];
}

// 7. Draft Action Payload (View/Review Draft vs Submit Directly)
export interface DraftCardPayload {
  expense_id: string;
  expense_data: ExpenseRecord;
  embedding?: number[];
  remarks_notice?: string;
  submitted?: boolean;
}

// 8. Pipeline Step Event (For Chat Streaming)
export type PipelineStepName = 
  | "EXTRACTING"
  | "VALIDATING_MATH"
  | "CHECKING_DUPLICATES"
  | "ROUND_TRIP_EVALUATION"
  | "HITL_TRIGGERED"
  | "DRAFT_READY"
  | "EXECUTING_ERP"
  | "COMPLETED"
  | "FAILED";

export interface PipelineEvent {
  step: PipelineStepName;
  message: string;
  data?: any;
  timestamp: string;
}
