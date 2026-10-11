import logging
from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Request

from backend.database import (
    fetch_conversations,
    create_conversation,
    delete_conversation,
    update_conversation_title,
    fetch_chat_messages,
    fetch_expense_by_id,
)

logger = logging.getLogger("backend.routes.conversations")
router = APIRouter(prefix="/api/conversations", tags=["Conversations"])

@router.get("")
async def get_conversations(userId: str = Query("emp_402")):
    try:
        convs = fetch_conversations(userId)
        return {"conversations": convs}
    except Exception as e:
        logger.error(f"Error fetching conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", status_code=201)
async def post_conversation(request: Request):
    try:
        body = await request.json()
        user_id = body.get("userId") or "emp_402"
        title = body.get("title") or "New Expense Session"
        conv = create_conversation(user_id, title)
        return {"conversation": conv}
    except Exception as e:
        logger.error(f"Error creating conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{conversation_id}")
async def get_conversation_messages(conversation_id: str):
    try:
        messages = fetch_chat_messages(conversation_id)
        # Enrich draft_cards and hitl_cards with live status from expenses store
        for msg in messages:
            draft_cards = msg.get("draft_cards") or []
            for dc in draft_cards:
                exp_id = dc.get("expense_id")
                if exp_id:
                    latest = fetch_expense_by_id(exp_id)
                    if latest:
                        dc["expense_data"] = latest
                        if latest.get("status") in ["Pending Approval", "Settlement Processing", "Paid", "Rejected"]:
                            dc["submitted"] = True

            hitl_cards = msg.get("hitl_cards") or []
            for hc in hitl_cards:
                exp_id = hc.get("expense_id")
                if exp_id:
                    latest = fetch_expense_by_id(exp_id)
                    if latest:
                        hc["expense_data"] = latest

        return {"messages": messages}
    except Exception as e:
        logger.error(f"Error fetching messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{conversation_id}")
async def patch_conversation(conversation_id: str, request: Request):
    try:
        body = await request.json()
        title = body.get("title")
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        update_conversation_title(conversation_id, title)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating conversation title: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{conversation_id}")
async def remove_conversation(conversation_id: str):
    try:
        success = delete_conversation(conversation_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Error deleting conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
