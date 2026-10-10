import logging
from fastapi import APIRouter, HTTPException, Request
from backend.agents.erp_executor import execute_erp_claim_submission

logger = logging.getLogger("backend.routes.erp")
router = APIRouter(prefix="/api/v1/mock-reimbursement", tags=["ERP Gateway"])

@router.post("/apply")
async def mock_reimbursement_apply(request: Request):
    try:
        body = await request.json()
        expense = body.get("expense") or body
        if not expense.get("vendor_name") or expense.get("total_amount") is None:
            raise HTTPException(
                status_code=400,
                detail="Invalid claim payload. vendor_name and total_amount are required."
            )

        result = execute_erp_claim_submission(expense)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in mock reimbursement gateway apply: {e}")
        raise HTTPException(status_code=500, detail=str(e))
