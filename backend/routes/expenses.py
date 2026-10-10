import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Query, HTTPException, Request
from backend.database import fetch_expenses, fetch_expense_by_id, save_expense, update_expense

logger = logging.getLogger("backend.routes.expenses")
router = APIRouter(prefix="/api/expenses", tags=["Expenses"])

@router.get("")
async def get_expenses(userId: Optional[str] = Query(None)):
    try:
        data = fetch_expenses(userId)
        return {"expenses": data}
    except Exception as e:
        logger.error(f"Error fetching expenses: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", status_code=201)
async def create_expense(request: Request):
    try:
        body = await request.json()
        saved = save_expense(body)
        return {"expense": saved}
    except Exception as e:
        logger.error(f"Error creating expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{expense_id}")
async def get_expense(expense_id: str):
    exp = fetch_expense_by_id(expense_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"expense": exp}

@router.patch("/{expense_id}")
async def patch_expense(expense_id: str, request: Request):
    try:
        body = await request.json()
        action = body.get("action")

        existing = fetch_expense_by_id(expense_id)
        if not existing:
            # Auto-recover from request payload so old chat cards never fail with 404
            payload = body.get("expense") or body.get("updates") or body
            existing = save_expense({
                "id": expense_id,
                "user_id": payload.get("user_id") or "emp_402",
                "bill_type": payload.get("bill_type") or "OTHER",
                "bill_date": payload.get("bill_date"),
                "vendor_name": payload.get("vendor_name") or "Submitted Expense",
                "total_amount": payload.get("total_amount") or 0.0,
                "currency": payload.get("currency") or "INR",
                "payment_mode": payload.get("payment_mode") or "UPI",
                "remarks": payload.get("remarks") or "",
                "specific_details": payload.get("specific_details") or {},
                "status": payload.get("status") or "Draft",
            })

        if action == "confirm_unique":
            payload = body.get("updates") or body.get("expense") or {}
            existing_remarks = payload.get("remarks") or existing.get("remarks") or ""
            new_remarks = f"{existing_remarks} | User confirmed unique override" if existing_remarks else "User confirmed unique override"
            updated = update_expense(expense_id, {
                **existing,
                **payload,
                "status": "Pending Approval",
                "remarks": new_remarks,
            })
            return {"success": True, "expense": updated}

        if action == "discard_duplicate":
            existing_remarks = existing.get("remarks") or ""
            new_remarks = f"{existing_remarks} | Discarded by user as duplicate" if existing_remarks else "Discarded by user as duplicate"
            updated = update_expense(expense_id, {
                **existing,
                "status": "Rejected",
                "remarks": new_remarks,
            })
            return {"success": True, "expense": updated}

        if action == "manual_resolve":
            exp_data = body.get("expense") or body
            existing_remarks = existing.get("remarks") or ""
            new_remarks = f"{existing_remarks} | Resolved via manual user input" if existing_remarks else "Resolved via manual user input"
            updated = update_expense(expense_id, {
                **existing,
                **exp_data,
                "status": "Pending Approval",
                "remarks": new_remarks,
            })
            return {"success": True, "expense": updated}

        # Standard update
        updated = update_expense(expense_id, {
            **existing,
            **body
        })
        return {"success": True, "expense": updated}

    except Exception as e:
        logger.error(f"Error updating expense {expense_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
