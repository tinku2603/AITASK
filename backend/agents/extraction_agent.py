import json
import re
import logging
from typing import List, Dict, Any, Tuple
from backend.llm.client import call_vision_llm

logger = logging.getLogger("backend.agents.extraction")

EXTRACTION_SYSTEM_PROMPT = """
You are Agent 1: The Vision Extraction Specialist in an autonomous reimbursement system.
Extract all relevant expense claims from the uploaded receipt images or PDF files.

Return a strictly formatted JSON object with an "expenses" array:
{
  "expenses": [
    {
      "bill_type": "CAB_LOCAL" | "FUEL" | "FOOD" | "FLIGHT" | "HOTEL" | "OTHER",
      "bill_date": "YYYY-MM-DD" or null,
      "vendor_name": "Merchant Name" or null,
      "total_amount": 450.00 or null,
      "currency": "INR",
      "payment_mode": "UPI" | "Corporate Card" | "Cash",
      "remarks": "Brief description of the expense",
      "specific_details": {
        "from_place": "Origin location if travel",
        "to_place": "Destination location if travel",
        "fuel_liters": null,
        "fuel_type": null,
        "restaurant_name": null,
        "flight_pnr": null,
        "line_items": [
          { "description": "Item name", "quantity": 1, "unit_price": 450.0, "amount": 450.0 }
        ]
      }
    }
  ]
}

RULES:
1. Mathematical validation: Sum(line_items[].amount) must equal total_amount.
2. If multi-page or combined invoice, output all distinct expenses as separate array items.
3. If merchant name, date, or total amount is missing or blurry, set the field to null.
Output ONLY raw JSON. No markdown ticks, no preamble.
"""

async def run_extraction_agent(
    files: List[Dict[str, Any]],
    user_prompt: str = "Extract expense receipt details.",
    user_id: str = "emp_402",
    llm_config: Dict[str, Any] = None
) -> Tuple[List[Dict[str, Any]], bool, bool]:
    raw_response = await call_vision_llm(
        system_prompt=EXTRACTION_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        files=files,
        llm_config=llm_config
    )

    clean_json = raw_response.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(clean_json)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", clean_json)
        if match:
            parsed = json.loads(match.group(0))
        else:
            parsed = {"expenses": []}

    raw_expenses = parsed.get("expenses")
    if not isinstance(raw_expenses, list):
        if parsed.get("vendor_name") or parsed.get("total_amount"):
            raw_expenses = [parsed]
        else:
            raw_expenses = []

    finalized = []
    has_missing_meta = False
    has_math_mismatch = False

    for item in raw_expenses:
        vendor = item.get("vendor_name")
        total = item.get("total_amount")
        date_str = item.get("bill_date")

        is_missing = not vendor or total is None or not date_str
        if is_missing:
            has_missing_meta = True

        specific = item.get("specific_details") or {}
        line_items = specific.get("line_items") or []
        math_err = False
        if isinstance(line_items, list) and len(line_items) > 0 and total is not None:
            calc_sum = sum(float(li.get("amount", 0.0)) for li in line_items)
            if abs(calc_sum - float(total)) > 1.0:
                math_err = True
                has_math_mismatch = True

        status = "Awaiting User Input" if (is_missing or math_err) else "Draft"
        conf = 0.6 if is_missing else (0.8 if math_err else 0.98)

        record = {
            "id": item.get("id"),
            "user_id": user_id,
            "bill_type": item.get("bill_type") or "OTHER",
            "bill_date": date_str,
            "vendor_name": vendor,
            "total_amount": float(total) if total is not None else None,
            "currency": item.get("currency") or "INR",
            "payment_mode": item.get("payment_mode") or "UPI",
            "remarks": item.get("remarks") or "",
            "specific_details": specific,
            "status": status,
            "confidence_score": conf,
            "validation_errors": []
        }
        if is_missing:
            record["validation_errors"].append("Vital metadata missing or obscured.")
        if math_err:
            record["validation_errors"].append("Itemized sum does not match total amount.")

        finalized.append(record)

    return finalized, has_missing_meta, has_math_mismatch
