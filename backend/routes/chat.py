import logging
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Request

from backend.agents.orchestrator import process_expense_pipeline
from backend.database import save_chat_message, update_conversation_title

logger = logging.getLogger("backend.routes.chat")
router = APIRouter(prefix="/api/chat", tags=["Chat"])

@router.post("")
async def handle_chat(request: Request):
    try:
        body = await request.json()
        files = body.get("files") or []
        message = body.get("message") or ""
        user_id = body.get("userId") or "emp_402"
        llm_config = body.get("llmConfig") or {}
        conversation_id = body.get("conversationId") or "conv_default"
        auto_submit = bool(body.get("autoSubmit"))

        if not files or not isinstance(files, list) or len(files) == 0:
            raise HTTPException(
                status_code=400,
                detail="No file attachments found. Please upload a receipt image (PNG, JPG) or invoice PDF."
            )

        # 1. Save user's message
        save_chat_message({
            "conversation_id": conversation_id,
            "sender": "user",
            "text": message or "Uploaded receipt document(s).",
            "files": [
                {
                    "name": f.get("name") or "receipt_document",
                    "type": f.get("mimeType") or "image/png",
                    "base64": f.get("base64Data") or "",
                }
                for f in files
            ],
        })

        # 2. Run multi-agent pipeline
        pipeline_result = await process_expense_pipeline(
            files=files,
            user_prompt=message or "Extract expense receipt details and process claim.",
            user_id=user_id,
            auto_submit=auto_submit,
            llm_config=llm_config
        )

        # 3. Save assistant response
        save_chat_message({
            "conversation_id": conversation_id,
            "sender": "assistant",
            "text": pipeline_result.get("summary", ""),
            "events": pipeline_result.get("events", []),
            "hitl_cards": pipeline_result.get("hitlCards", []),
            "draft_cards": pipeline_result.get("draftCards", []),
        })

        # 4. Intelligently update conversation title
        extracted = pipeline_result.get("extractedExpenses") or []
        if extracted:
            first_exp = extracted[0]
            v_name = first_exp.get("vendor_name") or "Claim"
            t_amt = first_exp.get("total_amount") or 0.0
            new_title = f"{v_name} - ₹{t_amt}"
            update_conversation_title(conversation_id, new_title)

        return {
            "success": True,
            "result": pipeline_result,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat pipeline: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
