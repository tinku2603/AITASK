import uuid
import datetime
import logging
from typing import List, Dict, Any, Optional

from backend.agents.extraction_agent import run_extraction_agent
from backend.agents.deduplication_agent import run_deduplication_agent
from backend.agents.hitl_mediator import create_hitl_mediation_card
from backend.agents.erp_executor import execute_erp_claim_submission
from backend.database import save_expense

logger = logging.getLogger("backend.agents.orchestrator")

async def process_expense_pipeline(
    files: List[Dict[str, Any]],
    user_prompt: str = "Process receipt claim.",
    user_id: str = "emp_402",
    auto_submit: bool = False,
    llm_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    events: List[Dict[str, str]] = []
    hitl_cards: List[Dict[str, Any]] = []
    draft_cards: List[Dict[str, Any]] = []
    duplicate_warnings: List[Dict[str, Any]] = []
    submitted_expenses: List[Dict[str, Any]] = []

    def emit(step: str, message: str):
        now_time = datetime.datetime.now().strftime("%H:%M:%S")
        events.append({
            "step": step,
            "message": message,
            "timestamp": now_time
        })
        logger.info(f"[{step}] {message}")

    emit("STARTING_VISION_EXTRACTION", f"Agent 1: Analyzing {len(files)} document file(s) for receipt details...")

    # Step 1: Agent 1 Extraction
    expenses, has_missing_meta, has_math_mismatch = await run_extraction_agent(
        files=files,
        user_prompt=user_prompt,
        user_id=user_id,
        llm_config=llm_config
    )

    emit("EXTRACTION_COMPLETE", f"Agent 1: Successfully structured {len(expenses)} expense item(s) from document payload.")

    for idx, expense in enumerate(expenses):
        prefix = f"[Item {idx+1}/{len(expenses)}] " if len(expenses) > 1 else ""

        # 1. Missing metadata check
        missing_fields = []
        if not expense.get("bill_date"):
            missing_fields.append("Bill Date")
        if expense.get("total_amount") is None:
            missing_fields.append("Total Amount")
        if not expense.get("vendor_name"):
            missing_fields.append("Vendor Name")

        if missing_fields:
            emit("HITL_TRIGGERED", f"{prefix}Agent 1 detected obscured/missing metadata ({', '.join(missing_fields)}). Halting for human input.")
            card = create_hitl_mediation_card(
                expense=expense,
                reason="MISSING_METADATA",
                message=f"The receipt is partially obscured. Please provide the missing {', '.join(missing_fields)} to proceed.",
                missing_fields=missing_fields
            )
            hitl_cards.append(card)
            continue

        # 2. Mathematical validation
        line_items = (expense.get("specific_details") or {}).get("line_items") or []
        total = expense.get("total_amount")
        if line_items and total is not None:
            calc_sum = sum(float(li.get("amount", 0.0)) for li in line_items)
            if abs(calc_sum - float(total)) > 1.0:
                emit("HITL_TRIGGERED", f"{prefix}Math mismatch detected: Sum of items (₹{calc_sum:.2f}) != Stated Total (₹{total:.2f}).")
                card = create_hitl_mediation_card(
                    expense=expense,
                    reason="MATH_MISMATCH",
                    message=f"The itemized sum (₹{calc_sum:.2f}) does not match the stated total (₹{total:.2f}). Please review."
                )
                hitl_cards.append(card)
                continue

        # 3. Agent 2: De-duplication Specialist (pgvector)
        emit("CHECKING_DUPLICATES", f"{prefix}Agent 2 generating vector embedding & querying pgvector similarity...")

        dedup, embedding = await run_deduplication_agent(
            expense=expense,
            api_key=llm_config.get("apiKey") if llm_config else None
        )

        dedup_status = dedup.get("status")
        similarity = float(dedup.get("highest_similarity", 0.0))

        # Corner Case 1: Round Trip Cab Bypass
        if dedup_status == "ROUND_TRIP_BYPASS":
            emit("ROUND_TRIP_EVALUATION", f"{prefix}Agent 2: Round Trip Cab detected! Origin & destination coordinates are inverted. Bypassing duplicate block.")
            if dedup.get("remarks_update"):
                cur_rem = expense.get("remarks") or ""
                expense["remarks"] = f"{cur_rem} | {dedup['remarks_update']}" if cur_rem else dedup["remarks_update"]

            if auto_submit:
                emit("EXECUTING_ERP", f"{prefix}Agent 4: Submitting verified Round Trip claim to Enterprise ERP Gateway...")
                erp_res = execute_erp_claim_submission(expense, embedding)
                submitted_expenses.append(erp_res["expense"])
                emit("COMPLETED", f"{prefix}Claim submitted to ERP with status: {erp_res['status']} (Ref: {erp_res['reference_id']})")
            else:
                draft_id = expense.get("id") or str(uuid.uuid4())
                expense["id"] = draft_id
                expense["status"] = "Draft"
                saved_draft = save_expense(expense, embedding)
                emit("DRAFT_READY", f"{prefix}Draft created! You can view & review details or submit directly to ERP.")
                draft_cards.append({
                    "expense_id": draft_id,
                    "expense_data": saved_draft,
                    "embedding": embedding,
                    "remarks_notice": "Verified Round-Trip Cab claim."
                })
            continue

        # High Match > 0.95: Definite Duplicate
        if dedup_status == "DEFINITE_DUPLICATE":
            emit("FAILED", f"{prefix}Agent 2 DUPLICATE BLOCKED: Similarity is {similarity * 100:.1f}%. Pipeline terminated.")
            duplicate_warnings.append({
                "expense": expense,
                "reason": "Duplicate bill detected in vector database.",
                "similarity": similarity
            })
            continue

        # Moderate Match 0.80 - 0.95: Human Override Required
        if dedup_status == "POTENTIAL_DUPLICATE":
            emit("HITL_TRIGGERED", f"{prefix}Agent 2 POTENTIAL DUPLICATE ({similarity * 100:.1f}% match). Halting for user confirmation.")
            conflicting = dedup.get("matched_record") or {}
            card = create_hitl_mediation_card(
                expense=expense,
                reason="POTENTIAL_DUPLICATE",
                message=f"High similarity ({similarity * 100:.1f}%) with an existing claim ({conflicting.get('vendor_name')}, ₹{conflicting.get('total_amount')}). Confirm if unique.",
                conflicting_expense=conflicting,
                embedding=embedding
            )
            hitl_cards.append(card)
            continue

        # Unique (< 0.80)
        if auto_submit:
            emit("EXECUTING_ERP", f"{prefix}Agent 4: Similarity < 0.80 (unique claim). Calling Enterprise ERP Gateway...")
            erp_res = execute_erp_claim_submission(expense, embedding)
            submitted_expenses.append(erp_res["expense"])
            emit("COMPLETED", f"{prefix}Claim successfully submitted to ERP (Status: Pending Approval, Ref: {erp_res['reference_id']}).")
        else:
            draft_id = expense.get("id") or str(uuid.uuid4())
            expense["id"] = draft_id
            expense["status"] = "Draft"
            saved_draft = save_expense(expense, embedding)
            emit("DRAFT_READY", f"{prefix}Draft created! Review before submission or submit directly to ERP.")
            draft_cards.append({
                "expense_id": draft_id,
                "expense_data": saved_draft,
                "embedding": embedding
            })

    summary = f"Pipeline finished: {len(expenses)} expense(s) evaluated."
    if draft_cards:
        summary += f" {len(draft_cards)} draft claim(s) ready for review or instant submission."
    if submitted_expenses:
        summary += f" {len(submitted_expenses)} claim(s) routed to ERP Pending Approval."
    if hitl_cards:
        summary += f" {len(hitl_cards)} item(s) awaiting your input."
    if duplicate_warnings:
        summary += f" {len(duplicate_warnings)} duplicate submission(s) blocked."

    return {
        "success": True,
        "events": events,
        "summary": summary,
        "extractedExpenses": expenses,
        "hitlCards": hitl_cards,
        "draftCards": draft_cards,
        "duplicateWarnings": duplicate_warnings,
        "submittedExpenses": submitted_expenses
    }
