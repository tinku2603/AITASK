# 🚀 Agentic Expense Tracker & Mock Reimbursement App

An autonomous, multi-agent expense reimbursement platform featuring **Multimodal Vision Extraction**, **Supabase `pgvector` Hybrid De-duplication**, **Human-in-the-Loop (HITL) Mediation**, and **Mock Enterprise ERP Execution**.

---

## 🛠️ Architecture & Multi-Agent Flow

```
[ Receipt Upload (PNG / JPG / PDF) ]
                  │
                  ▼
   Agent 1: Extraction Specialist (Gemini 2.0 / Grok / Local Gemma)
   - Structured JSON schema validation
   - Mathematical check: Sum(Line_Items) == Total
   - Multi-page grouped document support
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [Missing / Blur]     [Valid Extracted]
        │                   │
        │                   ▼
        │        Agent 2: Supabase pgvector De-Duplicator
        │        - Absolute metadata filters: user_id & bill_date
        │        - Round Trip Cab dilemma bypass (inverted routes)
        │                   │
        │      ┌────────────┼────────────┐
        │      ▼            ▼            ▼
        │   > 0.95     0.80 - 0.95    < 0.80
        │  [Duplicate]  [Potential]  [Unique]
        │      │            │            │
        ▼      ▼            ▼            │
   Agent 3: HITL Mediator                │
   - Interactive Decision Cards          │
   - [Confirm Unique] / [Discard]        │
        │                                │
        └──────────────┬─────────────────┘
                       ▼
   Agent 4: Mock ERP Executor
   - Calls `/api/v1/mock-reimbursement/apply`
   - Sets status to `Pending Approval`
                       │
                       ▼
   Claims Dashboard Lifecycle Tracker
   [ Draft ➔ Pending Approval ➔ Settlement Processing ➔ Paid ]
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (`.env.local`)
Create `.env.local` (or copy from `.env.example`):

```bash
# Vision LLM Provider: 'gemini', 'grok', 'groq', 'ollama', or 'mock'
NEXT_PUBLIC_LLM_PROVIDER="gemini"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.0-flash"

# Optional: Supabase PostgreSQL + pgvector
# (App automatically runs in offline sandbox mode if not configured)
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Optional: xAI Grok
GROK_API_KEY="your-xai-key"

# Optional: Local Ollama (Gemma / Llama)
OLLAMA_API_BASE="http://localhost:11434/v1"
OLLAMA_MODEL="gemma2"
```

### 3. Run Supabase Database Migration (Optional)
If using Supabase, copy and run the SQL schema in [`src/lib/supabase/schema.sql`](./src/lib/supabase/schema.sql) in your **Supabase Dashboard ➔ SQL Editor**. This sets up the `pgvector` extension, `expenses` table, HNSW vector index, and `match_expenses` similarity function.

### 4. Start the Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Automated Verification Suite
Run the test suite verifying all core cases and corner cases:

```bash
npm run test:verify
```

Tested Scenarios:
1. **Test Case A**: Pristine cab slip upload ➔ Automated straight submission to `Pending Approval`.
2. **Test Case B**: Consecutive duplicate bill upload ➔ Immediate duplicate detection & termination.
3. **Corner Case 1**: Round Trip Cab Dilemma ➔ High similarity + inverted locations ➔ Automatic bypass & labeled as "Round Trip".
4. **Corner Case 2**: Multi-Page Grouped Document ➔ Evaluates and returns distinct expense items array.
5. **Corner Case 3**: Blurry Metadata ➔ Drops down to Agent 3 HITL card for manual user input.
6. **Corner Case 4**: Mathematical Mismatch ➔ `Sum(Line_Items) != Total` triggers review card.

---

## 👥 Roles & Dashboard Lifecycle
- **Employee (`emp_402`)**: Uploads receipts, chats with agent, answers HITL cards, tracks claim statuses.
- **Manager (`mgr_101`)**: Organization overview, reviews pending claims, clicks **Approve** (moves to `Settlement Processing`) or **Mark Paid**.
