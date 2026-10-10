import logging
from typing import Dict, Any, List, Optional, Tuple
from backend.database import match_existing_expenses
from backend.llm.embeddings import generate_vector_embedding

logger = logging.getLogger("backend.agents.deduplication")

def is_inverted_cab_route(curr_specific: Dict[str, Any], existing_specific: Dict[str, Any]) -> bool:
    curr_from = str(curr_specific.get("from_place") or "").lower().strip()
    curr_to = str(curr_specific.get("to_place") or "").lower().strip()
    exist_from = str(existing_specific.get("from_place") or "").lower().strip()
    exist_to = str(existing_specific.get("to_place") or "").lower().strip()

    if curr_from and curr_to and exist_from and exist_to:
        # Direct inverted check
        if curr_from == exist_to and curr_to == exist_from:
            return True
        # Fuzzy substring match
        if (curr_from in exist_to or exist_to in curr_from) and (curr_to in exist_from or exist_from in curr_to):
            return True
    return False

async def run_deduplication_agent(
    expense: Dict[str, Any],
    api_key: Optional[str] = None
) -> Tuple[Dict[str, Any], List[float]]:
    vendor = expense.get("vendor_name") or "Unknown"
    date_str = expense.get("bill_date") or ""
    amount = expense.get("total_amount") or 0.0

    context_str = f"Vendor: {vendor} | Date: {date_str} | Amount: {amount}"
    embedding = await generate_vector_embedding(context_str, api_key=api_key)

    user_id = expense.get("user_id") or "emp_402"
    matches = match_existing_expenses(
        query_embedding=embedding,
        user_id=user_id,
        bill_date=date_str,
        threshold=0.70
    )

    if not matches:
        return {
            "status": "UNIQUE",
            "highest_similarity": 0.0,
            "matched_record": None
        }, embedding

    top_match = matches[0]
    similarity = float(top_match.get("similarity", 0.0))

    # Corner Case 1: Round Trip Cab Dilemma
    is_cab = (expense.get("bill_type") == "CAB_LOCAL" or "CAB" in str(expense.get("bill_type", "")))
    matched_specific = top_match.get("specific_details") or {}
    curr_specific = expense.get("specific_details") or {}

    if is_cab and similarity > 0.85:
        if is_inverted_cab_route(curr_specific, matched_specific):
            from_loc = curr_specific.get("from_place") or "Origin"
            to_loc = curr_specific.get("to_place") or "Destination"
            return {
                "status": "ROUND_TRIP_BYPASS",
                "highest_similarity": similarity,
                "matched_record": top_match,
                "remarks_update": f"Round Trip: Return leg verified ({from_loc} -> {to_loc})"
            }, embedding

    if similarity > 0.95:
        return {
            "status": "DEFINITE_DUPLICATE",
            "highest_similarity": similarity,
            "matched_record": top_match
        }, embedding

    if similarity >= 0.80:
        return {
            "status": "POTENTIAL_DUPLICATE",
            "highest_similarity": similarity,
            "matched_record": top_match
        }, embedding

    return {
        "status": "UNIQUE",
        "highest_similarity": similarity,
        "matched_record": top_match
    }, embedding
