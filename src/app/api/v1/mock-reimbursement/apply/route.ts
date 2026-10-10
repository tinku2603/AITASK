import { NextRequest, NextResponse } from "next/server";
import { executeErpClaimSubmission } from "@/lib/agents/erpExecutor";
import { ExpenseRecord } from "@/lib/agents/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const expense: ExpenseRecord = body.expense || body;

    if (!expense.vendor_name || expense.total_amount === null || expense.total_amount === undefined) {
      return NextResponse.json(
        { error: "Invalid claim payload. vendor_name and total_amount are required." },
        { status: 400 }
      );
    }

    const result = await executeErpClaimSubmission(expense);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Mock ERP apply error:", error);
    return NextResponse.json(
      { error: "Internal ERP Gateway error: " + error.message },
      { status: 500 }
    );
  }
}
