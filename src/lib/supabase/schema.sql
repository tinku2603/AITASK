-- ========================================================
-- AGENTIC EXPENSE TRACKER - SUPABASE + PGVECTOR SCHEMA
-- ========================================================
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor)

-- 1. Enable the pgvector extension for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    bill_type TEXT CHECK (bill_type IN ('CAB_LOCAL', 'FUEL', 'FOOD', 'FLIGHT', 'HOTEL', 'OTHER')),
    bill_date DATE NOT NULL,
    vendor_name TEXT NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    payment_mode TEXT,
    remarks TEXT,
    specific_details JSONB DEFAULT '{}'::jsonb,
    status TEXT CHECK (status IN ('Draft', 'Awaiting User Input', 'Pending Approval', 'Settlement Processing', 'Paid', 'Rejected')) DEFAULT 'Draft',
    embedding vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create indexes for high-speed queries & metadata filtering
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses (status);
CREATE INDEX IF NOT EXISTS idx_expenses_embedding ON expenses USING hnsw (embedding vector_cosine_ops);

-- 4. Vector similarity match function with strict metadata filtering
CREATE OR REPLACE FUNCTION match_expenses(
    query_embedding vector(768),
    filter_user_id text,
    filter_bill_date date,
    match_threshold float DEFAULT 0.70,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id TEXT,
    user_id TEXT,
    bill_type TEXT,
    bill_date DATE,
    vendor_name TEXT,
    total_amount NUMERIC(12, 2),
    currency TEXT,
    payment_mode TEXT,
    remarks TEXT,
    specific_details JSONB,
    status TEXT,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.user_id,
        e.bill_type,
        e.bill_date,
        e.vendor_name,
        e.total_amount,
        e.currency,
        e.payment_mode,
        e.remarks,
        e.specific_details,
        e.status,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM expenses e
    WHERE e.user_id = filter_user_id
      AND e.bill_date = filter_bill_date
      AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
    ORDER BY e.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

-- 5. Seed sample demo expenses for testing
INSERT INTO expenses (id, user_id, bill_type, bill_date, vendor_name, total_amount, currency, remarks, specific_details, status)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'emp_402', 'CAB_LOCAL', CURRENT_DATE, 'Uber India', 450.00, 'INR', 'Client visit outbound', '{"from_place": "Koramangala Office", "to_place": "Whitefield Tech Park", "line_items": [{"description": "Uber Go Ride", "amount": 450.00}]}', 'Pending Approval'),
  ('22222222-2222-2222-2222-222222222222', 'emp_402', 'FOOD', CURRENT_DATE - INTERVAL '1 day', 'Third Wave Coffee', 380.00, 'INR', 'Team sync refreshment', '{"line_items": [{"description": "Cold Brew", "amount": 220.00}, {"description": "Croissant", "amount": 160.00}]}', 'Settlement Processing'),
  ('33333333-3333-3333-3333-333333333333', 'emp_402', 'FUEL', CURRENT_DATE - INTERVAL '3 days', 'Shell Petrol Station', 2500.00, 'INR', 'Field visit fuel', '{"fuel_liters": 24.5, "fuel_type": "Petrol"}', 'Paid')
ON CONFLICT (id) DO NOTHING;

-- 6. Conversations & Multi-Chat History Tables
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant', 'system')),
    text TEXT NOT NULL,
    files JSONB DEFAULT '[]'::jsonb,
    events JSONB DEFAULT '[]'::jsonb,
    hitl_cards JSONB DEFAULT '[]'::jsonb,
    draft_cards JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, created_at ASC);

