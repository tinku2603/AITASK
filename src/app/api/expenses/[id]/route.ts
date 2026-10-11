import { NextRequest, NextResponse } from "next/server";
import { fetchExpenseById, updateExpense, saveExpense, deleteExpense } from "@/lib/supabase/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const expense = await fetchExpenseById(id);
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    return NextResponse.json({ expense });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteExpense(id);
    return NextResponse.json({ success: true, message: `Expense ${id} deleted successfully` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = body.action; // 'confirm_unique', 'discard_duplicate', 'manual_resolve', or standard update

    // Look for existing record in database / memory
    let existing = await fetchExpenseById(id);

    // If not found in DB or memory (e.g., from an earlier chat session or offline draft),
    // auto-recover using the body payload so the user's action never hits a 404 error
    if (!existing) {
      const payloadData = body.expense || body.updates || body || {};
      existing = await saveExpense({
        id,
        user_id: payloadData.user_id || "emp_402",
        bill_type: payloadData.bill_type || "OTHER",
        bill_date: payloadData.bill_date || new Date().toISOString().split("T")[0],
        vendor_name: payloadData.vendor_name || "Submitted Expense",
        total_amount: Number(payloadData.total_amount) || 0,
        currency: payloadData.currency || "INR",
        payment_mode: payloadData.payment_mode || "UPI",
        remarks: payloadData.remarks || "",
        specific_details: payloadData.specific_details || {},
        status: payloadData.status || "Draft",
      });
    }

    if (action === "confirm_unique") {
      // User overrides duplicate warning and confirms unique
      const payload = body.updates || body.expense || {};
      const updated = await updateExpense(id, {
        ...existing,
        ...payload,
        status: "Pending Approval",
        remarks: (payload.remarks || existing.remarks)
          ? `${payload.remarks || existing.remarks} | User confirmed unique override`
          : "User confirmed unique override",
      });
      return NextResponse.json({ success: true, expense: updated });
    }

    if (action === "discard_duplicate") {
      // User discards duplicate
      const updated = await updateExpense(id, {
        ...existing,
        status: "Rejected",
        remarks: existing.remarks
          ? `${existing.remarks} | Discarded by user as duplicate`
          : "Discarded by user as duplicate",
      });
      return NextResponse.json({ success: true, expense: updated });
    }

    if (action === "manual_resolve") {
      // User filled in missing data from blurry receipt
      const updatedData = {
        ...existing,
        ...(body.expense || body),
        status: "Pending Approval",
        remarks: existing.remarks
          ? `${existing.remarks} | Resolved via manual user input`
          : "Resolved via manual user input",
      };
      const saved = await updateExpense(id, updatedData);
      return NextResponse.json({ success: true, expense: saved });
    }

    // Standard updates (e.g. status transition from Draft to Pending Approval, or manager progression)
    const updated = await updateExpense(id, {
      ...existing,
      ...body,
    });
    return NextResponse.json({ success: true, expense: updated });
  } catch (error: any) {
    console.error("PATCH /api/expenses/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
