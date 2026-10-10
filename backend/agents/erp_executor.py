import uuid
import random
import datetime
import logging
from typing import Dict, Any, Optional, List
from backend.database import save_expense

logger = logging.getLogger("backend.agents.erp")

def execute_erp_claim_submission(
    expense: Dict[str, Any],
    embedding: Optional[List[float]] = None
) -> Dict[str, Any]:
    exp_id = expense.get("id") or str(uuid.uuid4())
    year = datetime.date.today().year
    random_num = random.randint(100000, 999999)
    reference_id = f"ERP-{year}-{random_num}"
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"

    existing_remarks = expense.get("remarks") or ""
    new_remarks = f"{existing_remarks} [Ref: {reference_id}]" if existing_remarks else f"Submitted via Agentic Gateway [Ref: {reference_id}]"

    final_expense = dict(expense)
    final_expense["id"] = exp_id
    final_expense["status"] = "Pending Approval"
    final_expense["remarks"] = new_remarks

    saved = save_expense(final_expense, embedding)

    return {
        "success": True,
        "reference_id": reference_id,
        "status": "Pending Approval",
        "erp_timestamp": now_iso,
        "message": f"Claim successfully submitted to Enterprise ERP Gateway with ID {reference_id}",
        "expense": saved,
    }
