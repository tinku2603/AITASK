import uuid
import logging
from typing import Dict, Any, Optional, List
from backend.database import save_expense

logger = logging.getLogger("backend.agents.hitl")

def create_hitl_mediation_card(
    expense: Dict[str, Any],
    reason: str,
    message: str,
    conflicting_expense: Optional[Dict[str, Any]] = None,
    missing_fields: Optional[List[str]] = None,
    embedding: Optional[List[float]] = None
) -> Dict[str, Any]:
    exp_id = expense.get("id") or str(uuid.uuid4())
    draft_expense = dict(expense)
    draft_expense["id"] = exp_id
    draft_expense["status"] = "Awaiting User Input"

    save_expense(draft_expense, embedding)

    return {
        "expense_id": exp_id,
        "expense_data": draft_expense,
        "reason": reason,
        "message": message,
        "similarity_score": conflicting_expense.get("similarity") if conflicting_expense else None,
        "conflicting_expense": conflicting_expense,
        "missing_fields": missing_fields,
    }
