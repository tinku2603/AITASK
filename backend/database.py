import uuid
import datetime
import logging
from typing import Optional, List, Dict, Any
import numpy as np

from backend.config import SUPABASE_URL, SUPABASE_KEY

logger = logging.getLogger("backend.database")
logging.basicConfig(level=logging.INFO)

# Supabase Client setup
supabase_client = None
if SUPABASE_URL and SUPABASE_KEY and "placeholder" not in SUPABASE_URL:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info(f"Supabase client initialized successfully with URL: {SUPABASE_URL}")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")

# Exact allowed columns matching public.expenses table schema
ALLOWED_EXPENSE_COLUMNS = {
    "id",
    "user_id",
    "bill_type",
    "bill_date",
    "vendor_name",
    "total_amount",
    "currency",
    "payment_mode",
    "remarks",
    "specific_details",
    "status",
    "embedding",
    "created_at",
    "updated_at",
}

# In-memory fallback stores
memory_expenses: Dict[str, Dict[str, Any]] = {
    "11111111-1111-1111-1111-111111111111": {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": "emp_402",
        "bill_type": "CAB_LOCAL",
        "bill_date": datetime.date.today().isoformat(),
        "vendor_name": "Uber India",
        "total_amount": 450.0,
        "currency": "INR",
        "payment_mode": "UPI",
        "remarks": "Client visit outbound",
        "specific_details": {
            "from_place": "Koramangala Office",
            "to_place": "Whitefield Tech Park",
            "line_items": [{"description": "Uber Go Ride", "amount": 450.0}],
        },
        "status": "Pending Approval",
        "created_at": (datetime.datetime.utcnow() - datetime.timedelta(hours=4)).isoformat() + "Z",
    },
    "22222222-2222-2222-2222-222222222222": {
        "id": "22222222-2222-2222-2222-222222222222",
        "user_id": "emp_402",
        "bill_type": "FOOD",
        "bill_date": (datetime.date.today() - datetime.timedelta(days=1)).isoformat(),
        "vendor_name": "Third Wave Coffee",
        "total_amount": 380.0,
        "currency": "INR",
        "payment_mode": "UPI",
        "remarks": "Team sync refreshment",
        "specific_details": {
            "line_items": [
                {"description": "Cold Brew", "amount": 220.0},
                {"description": "Croissant", "amount": 160.0},
            ]
        },
        "status": "Settlement Processing",
        "created_at": (datetime.datetime.utcnow() - datetime.timedelta(days=1)).isoformat() + "Z",
    },
    "33333333-3333-3333-3333-333333333333": {
        "id": "33333333-3333-3333-3333-333333333333",
        "user_id": "emp_402",
        "bill_type": "FUEL",
        "bill_date": (datetime.date.today() - datetime.timedelta(days=3)).isoformat(),
        "vendor_name": "Shell Petrol Station",
        "total_amount": 2500.0,
        "currency": "INR",
        "payment_mode": "Corporate Card",
        "remarks": "Field visit fuel",
        "specific_details": {
            "fuel_liters": 24.5,
            "fuel_type": "Petrol",
        },
        "status": "Paid",
        "created_at": (datetime.datetime.utcnow() - datetime.timedelta(days=3)).isoformat() + "Z",
    },
}

memory_conversations: Dict[str, Dict[str, Any]] = {
    "conv_default": {
        "id": "conv_default",
        "user_id": "emp_402",
        "title": "Current Expense Session",
        "created_at": datetime.datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.datetime.utcnow().isoformat() + "Z",
    }
}

memory_chat_messages: Dict[str, List[Dict[str, Any]]] = {}

# Normalization utilities
def normalize_bill_type(raw_type: Optional[str]) -> str:
    if not raw_type:
        return "OTHER"
    upper = str(raw_type).strip().upper()
    if upper in {"CAB_LOCAL", "FUEL", "FOOD", "FLIGHT", "HOTEL", "OTHER"}:
        return upper
    if any(k in upper for k in ["CAB", "TAXI", "UBER", "OLA", "RIDE"]):
        return "CAB_LOCAL"
    if any(k in upper for k in ["FUEL", "PETROL", "DIESEL", "GAS"]):
        return "FUEL"
    if any(k in upper for k in ["FOOD", "MEAL", "DINNER", "LUNCH", "CAFE", "RESTAURANT", "COFFEE"]):
        return "FOOD"
    if any(k in upper for k in ["FLIGHT", "AIR", "AIRLINE"]):
        return "FLIGHT"
    if any(k in upper for k in ["HOTEL", "STAY", "LODGING", "ROOM"]):
        return "HOTEL"
    return "OTHER"

def normalize_status(raw_status: Optional[str]) -> str:
    if not raw_status:
        return "Draft"
    s = str(raw_status).strip()
    valid_statuses = {
        "Draft",
        "Awaiting User Input",
        "Pending Approval",
        "Settlement Processing",
        "Paid",
        "Rejected",
    }
    if s in valid_statuses:
        return s
    lower = s.lower()
    if "pending" in lower or "submit" in lower:
        return "Pending Approval"
    if "settl" in lower or "process" in lower:
        return "Settlement Processing"
    if "paid" in lower or "approv" in lower:
        return "Paid"
    if "reject" in lower or "discard" in lower:
        return "Rejected"
    if "await" in lower or "input" in lower:
        return "Awaiting User Input"
    return "Draft"

def normalize_bill_date(raw_date: Optional[str]) -> str:
    today_str = datetime.date.today().isoformat()
    if not raw_date:
        return today_str
    str_val = str(raw_date).strip()
    if "T" in str_val:
        return str_val.split("T")[0]
    try:
        parsed = datetime.datetime.strptime(str_val, "%Y-%m-%d")
        return parsed.strftime("%Y-%m-%d")
    except Exception:
        pass
    return today_str

def sanitize_db_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Strips out any fields not present in Supabase table schema
    such as 'confidence_score' and 'validation_errors'.
    """
    sanitized: Dict[str, Any] = {}
    specific_details = record.get("specific_details") or {}
    if not isinstance(specific_details, dict):
        specific_details = {}

    extra_meta = {}
    for k, v in record.items():
        if k in ALLOWED_EXPENSE_COLUMNS:
            sanitized[k] = v
        else:
            # Stash extras like confidence_score, validation_errors in specific_details._meta
            extra_meta[k] = v

    if extra_meta:
        if "_meta" not in specific_details:
            specific_details["_meta"] = {}
        specific_details["_meta"].update(extra_meta)

    sanitized["specific_details"] = specific_details
    sanitized["bill_type"] = normalize_bill_type(sanitized.get("bill_type"))
    sanitized["status"] = normalize_status(sanitized.get("status"))
    sanitized["bill_date"] = normalize_bill_date(sanitized.get("bill_date"))
    sanitized["total_amount"] = float(sanitized.get("total_amount") or 0.0)

    # Ensure embedding is valid list or None
    emb = sanitized.get("embedding")
    if isinstance(emb, list) and len(emb) > 0:
        sanitized["embedding"] = emb
    else:
        sanitized["embedding"] = None

    return sanitized

# Repository Operations
def fetch_expenses(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    db_items: List[Dict[str, Any]] = []
    if supabase_client:
        try:
            q = supabase_client.from_("expenses").select("*").order("created_at", desc=True)
            if user_id and user_id != "ALL":
                q = q.eq("user_id", user_id)
            res = q.execute()
            if res.data:
                db_items = res.data
        except Exception as e:
            logger.warning(f"Supabase fetch_expenses warning: {e}")

    # Merge with memory
    db_ids = {item["id"] for item in db_items}
    extra_memory = [
        exp for exp in memory_expenses.values()
        if exp["id"] not in db_ids and (not user_id or user_id == "ALL" or exp.get("user_id") == user_id)
    ]

    all_items = db_items + extra_memory
    all_items.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
    return all_items

def fetch_expense_by_id(expense_id: str) -> Optional[Dict[str, Any]]:
    if supabase_client:
        try:
            res = supabase_client.from_("expenses").select("*").eq("id", expense_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            logger.warning(f"Supabase fetch_expense_by_id warning: {e}")

    return memory_expenses.get(expense_id)

def save_expense(expense_data: Dict[str, Any], embedding: Optional[List[float]] = None) -> Dict[str, Any]:
    exp_id = expense_data.get("id")
    if not exp_id or len(str(exp_id)) < 5:
        exp_id = str(uuid.uuid4())

    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    record = {
        "id": exp_id,
        "user_id": expense_data.get("user_id") or "emp_402",
        "bill_type": expense_data.get("bill_type") or "OTHER",
        "bill_date": expense_data.get("bill_date") or now_iso.split("T")[0],
        "vendor_name": expense_data.get("vendor_name") or "Unknown Vendor",
        "total_amount": expense_data.get("total_amount") or 0.0,
        "currency": expense_data.get("currency") or "INR",
        "payment_mode": expense_data.get("payment_mode") or "UPI",
        "remarks": expense_data.get("remarks") or "",
        "specific_details": expense_data.get("specific_details") or {},
        "status": expense_data.get("status") or "Draft",
        "embedding": embedding if embedding else expense_data.get("embedding"),
        "created_at": expense_data.get("created_at") or now_iso,
        "updated_at": now_iso,
    }

    sanitized = sanitize_db_record(record)

    if supabase_client:
        try:
            res = supabase_client.from_("expenses").upsert(sanitized).execute()
            logger.info(f"Upserted expense {exp_id} to Supabase successfully")
        except Exception as e:
            logger.warning(f"Supabase save_expense error: {e}")

    memory_expenses[exp_id] = sanitized
    return sanitized

def update_expense(expense_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    existing = fetch_expense_by_id(expense_id) or {}
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"

    merged = {
        "id": expense_id,
        "user_id": updates.get("user_id") or existing.get("user_id") or "emp_402",
        "bill_type": updates.get("bill_type") or existing.get("bill_type") or "OTHER",
        "bill_date": updates.get("bill_date") or existing.get("bill_date") or now_iso.split("T")[0],
        "vendor_name": updates.get("vendor_name") or existing.get("vendor_name") or "Expense",
        "total_amount": updates.get("total_amount") if updates.get("total_amount") is not None else existing.get("total_amount", 0.0),
        "currency": updates.get("currency") or existing.get("currency") or "INR",
        "payment_mode": updates.get("payment_mode") or existing.get("payment_mode") or "UPI",
        "remarks": updates.get("remarks") or existing.get("remarks") or "",
        "specific_details": updates.get("specific_details") or existing.get("specific_details") or {},
        "status": updates.get("status") or existing.get("status") or "Draft",
        "embedding": updates.get("embedding") if "embedding" in updates else existing.get("embedding"),
        "created_at": existing.get("created_at") or now_iso,
        "updated_at": now_iso,
    }

    sanitized = sanitize_db_record(merged)

    if supabase_client:
        try:
            supabase_client.from_("expenses").upsert(sanitized).execute()
            logger.info(f"Updated expense {expense_id} in Supabase successfully")
        except Exception as e:
            logger.warning(f"Supabase update_expense error: {e}")

    memory_expenses[expense_id] = sanitized

    # Also update any draft cards inside memory chat messages so UI state reflects submission
    try:
        new_status = sanitized.get("status")
        for conv_id, msgs in memory_chat_messages.items():
            for m in msgs:
                if "draft_cards" in m and isinstance(m["draft_cards"], list):
                    for dc in m["draft_cards"]:
                        if dc.get("expense_id") == expense_id:
                            dc["submitted"] = True
                            if "expense_data" in dc and isinstance(dc["expense_data"], dict):
                                dc["expense_data"]["status"] = new_status
    except Exception as e:
        logger.debug(f"Notice: draft cards sync: {e}")

    return sanitized

def calculate_cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    a = np.array(vec_a, dtype=float)
    b = np.array(vec_b, dtype=float)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))

def match_existing_expenses(
    query_embedding: List[float],
    user_id: str,
    bill_date: str,
    threshold: float = 0.70
) -> List[Dict[str, Any]]:
    # 1. Try Supabase RPC
    if supabase_client:
        try:
            rpc_res = supabase_client.rpc(
                "match_expenses",
                {
                    "query_embedding": query_embedding,
                    "filter_user_id": user_id,
                    "filter_bill_date": bill_date,
                    "match_threshold": threshold,
                    "match_count": 5,
                }
            ).execute()
            if rpc_res.data and len(rpc_res.data) > 0:
                return rpc_res.data
        except Exception as e:
            logger.debug(f"RPC match_expenses skipped/failed: {e}")

        # 2. Try Supabase exact metadata query with in-Python vector cosine
        try:
            res = (
                supabase_client.from_("expenses")
                .select("*")
                .eq("user_id", user_id)
                .eq("bill_date", bill_date)
                .execute()
            )
            if res.data and len(res.data) > 0:
                matches = []
                for exp in res.data:
                    emb = exp.get("embedding")
                    sim = 0.0
                    if emb and isinstance(emb, list) and len(emb) == len(query_embedding):
                        sim = calculate_cosine_similarity(query_embedding, emb)
                    else:
                        safe_v = (exp.get("vendor_name") or "").lower()
                        sim = 0.95 if safe_v else 0.5
                    if sim >= threshold:
                        item = dict(exp)
                        item["similarity"] = sim
                        matches.append(item)
                if matches:
                    matches.sort(key=lambda x: x["similarity"], reverse=True)
                    return matches
        except Exception as e:
            logger.debug(f"Direct metadata query exception: {e}")

    # 3. Fallback in-memory
    matches = []
    for exp in memory_expenses.values():
        if exp.get("user_id") == user_id and exp.get("bill_date") == bill_date:
            emb = exp.get("embedding")
            sim = 0.0
            if emb and isinstance(emb, list) and len(emb) == len(query_embedding):
                sim = calculate_cosine_similarity(query_embedding, emb)
            else:
                safe_v = (exp.get("vendor_name") or "").lower()
                sim = 0.95 if safe_v else 0.5
            if sim >= threshold:
                item = dict(exp)
                item["similarity"] = sim
                matches.append(item)

    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return matches

# Conversation & Chat Message Management
def fetch_conversations(user_id: str = "emp_402") -> List[Dict[str, Any]]:
    if supabase_client:
        try:
            res = (
                supabase_client.from_("conversations")
                .select("*")
                .eq("user_id", user_id)
                .order("updated_at", desc=True)
                .execute()
            )
            if res.data:
                return res.data
        except Exception as e:
            logger.warning(f"Supabase fetch_conversations warning: {e}")

    all_convs = [c for c in memory_conversations.values() if c.get("user_id") == user_id]
    all_convs.sort(key=lambda x: str(x.get("updated_at", "")), reverse=True)
    return all_convs

def create_conversation(user_id: str = "emp_402", title: str = "New Conversation") -> Dict[str, Any]:
    conv_id = str(uuid.uuid4())
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    record = {
        "id": conv_id,
        "user_id": user_id,
        "title": title,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    if supabase_client:
        try:
            supabase_client.from_("conversations").insert(record).execute()
        except Exception as e:
            logger.warning(f"Supabase create_conversation error: {e}")

    memory_conversations[conv_id] = record
    return record

def delete_conversation(conv_id: str) -> bool:
    if supabase_client:
        try:
            supabase_client.from_("conversations").delete().eq("id", conv_id).execute()
        except Exception:
            pass

    memory_conversations.pop(conv_id, None)
    memory_chat_messages.pop(conv_id, None)
    return True

def update_conversation_title(conv_id: str, title: str) -> None:
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    if conv_id in memory_conversations:
        memory_conversations[conv_id]["title"] = title
        memory_conversations[conv_id]["updated_at"] = now_iso

    if supabase_client:
        try:
            supabase_client.from_("conversations").update({
                "title": title,
                "updated_at": now_iso
            }).eq("id", conv_id).execute()
        except Exception:
            pass

def fetch_chat_messages(conv_id: str) -> List[Dict[str, Any]]:
    if supabase_client:
        try:
            res = (
                supabase_client.from_("chat_messages")
                .select("*")
                .eq("conversation_id", conv_id)
                .order("created_at", desc=False)
                .execute()
            )
            if res.data:
                return res.data
        except Exception:
            pass

    return memory_chat_messages.get(conv_id, [])

def save_chat_message(msg_dict: Dict[str, Any]) -> Dict[str, Any]:
    msg_id = msg_dict.get("id") or str(uuid.uuid4())
    conv_id = msg_dict.get("conversation_id") or "conv_default"
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"

    record = {
        "id": msg_id,
        "conversation_id": conv_id,
        "sender": msg_dict.get("sender") or "user",
        "text": msg_dict.get("text") or "",
        "files": msg_dict.get("files") or [],
        "events": msg_dict.get("events") or [],
        "hitl_cards": msg_dict.get("hitl_cards") or [],
        "draft_cards": msg_dict.get("draft_cards") or [],
        "created_at": msg_dict.get("created_at") or now_iso,
    }

    if supabase_client:
        try:
            # Ensure conversation parent row exists for foreign key
            supabase_client.from_("conversations").upsert({
                "id": conv_id,
                "user_id": "emp_402",
                "title": "Claim Session",
                "updated_at": now_iso,
            }).execute()

            supabase_client.from_("chat_messages").insert(record).execute()
        except Exception as e:
            logger.warning(f"Supabase save_chat_message error: {e}")

    if conv_id not in memory_chat_messages:
        memory_chat_messages[conv_id] = []
    memory_chat_messages[conv_id].append(record)

    if conv_id in memory_conversations:
        memory_conversations[conv_id]["updated_at"] = now_iso

    return record
