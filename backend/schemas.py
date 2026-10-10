from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime

class LineItem(BaseModel):
    description: str = "Item"
    quantity: Optional[float] = 1.0
    unit_price: Optional[float] = None
    amount: float = 0.0

class SpecificDetails(BaseModel):
    from_place: Optional[str] = None
    to_place: Optional[str] = None
    fuel_liters: Optional[float] = None
    fuel_type: Optional[str] = None
    restaurant_name: Optional[str] = None
    flight_pnr: Optional[str] = None
    line_items: List[LineItem] = Field(default_factory=list)
    meta: Optional[Dict[str, Any]] = None

class ExpenseRecord(BaseModel):
    id: Optional[str] = None
    user_id: str = "emp_402"
    bill_type: str = "OTHER"
    bill_date: Optional[str] = None
    vendor_name: Optional[str] = None
    total_amount: Optional[float] = None
    currency: str = "INR"
    payment_mode: Optional[str] = "UPI"
    remarks: Optional[str] = ""
    specific_details: Optional[Dict[str, Any]] = Field(default_factory=dict)
    status: str = "Draft"
    confidence_score: Optional[float] = 0.95
    validation_errors: Optional[List[str]] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class ChatFileAttachment(BaseModel):
    name: str
    mimeType: str
    base64Data: str

class LLMConfigOverride(BaseModel):
    provider: Optional[str] = None
    apiKey: Optional[str] = None
    baseURL: Optional[str] = None
    modelName: Optional[str] = None

class ChatRequest(BaseModel):
    message: Optional[str] = ""
    userId: Optional[str] = "emp_402"
    conversationId: Optional[str] = "conv_default"
    files: List[ChatFileAttachment] = Field(default_factory=list)
    autoSubmit: Optional[bool] = False
    llmConfig: Optional[LLMConfigOverride] = None

class HitlCardPayload(BaseModel):
    expense_id: str
    expense_data: Dict[str, Any]
    reason: str
    message: str
    similarity_score: Optional[float] = None
    conflicting_expense: Optional[Dict[str, Any]] = None
    missing_fields: Optional[List[str]] = None

class DraftCardPayload(BaseModel):
    expense_id: str
    expense_data: Dict[str, Any]
    embedding: Optional[List[float]] = None
    remarks_notice: Optional[str] = None

class PipelineEvent(BaseModel):
    step: str
    message: str
    timestamp: str

class PipelineResult(BaseModel):
    success: bool
    events: List[PipelineEvent]
    summary: str
    extractedExpenses: List[Dict[str, Any]]
    hitlCards: List[HitlCardPayload]
    draftCards: List[DraftCardPayload]
    duplicateWarnings: List[Dict[str, Any]]
    submittedExpenses: List[Dict[str, Any]]

class ExpenseUpdateRequest(BaseModel):
    action: Optional[str] = None  # 'confirm_unique', 'discard_duplicate', 'manual_resolve', or None
    expense: Optional[Dict[str, Any]] = None
    updates: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    vendor_name: Optional[str] = None
    total_amount: Optional[float] = None
    bill_date: Optional[str] = None
    bill_type: Optional[str] = None
    remarks: Optional[str] = None
    specific_details: Optional[Dict[str, Any]] = None

class ConversationCreate(BaseModel):
    userId: str = "emp_402"
    title: Optional[str] = "New Conversation"

class ConversationUpdate(BaseModel):
    title: str
