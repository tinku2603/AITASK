import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.expenses import router as expenses_router
from backend.routes.chat import router as chat_router
from backend.routes.conversations import router as conversations_router
from backend.routes.erp import router as erp_router

app = FastAPI(
    title="Agentic Expense Reimbursement API",
    description="Python FastAPI backend powering multi-agent vision extraction, pgvector deduplication, HITL mediation, and mock ERP reimbursement.",
    version="1.0.0",
)

# Enable CORS for Next.js Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(expenses_router)
app.include_router(chat_router)
app.include_router(conversations_router)
app.include_router(erp_router)

@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {
        "status": "online",
        "service": "Agentic Expense Reimbursement Backend (Python FastAPI)",
        "docs_url": "/docs",
    }

@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"🚀 Starting Python FastAPI backend on http://0.0.0.0:{port}")
    print(f"📖 Interactive Swagger Docs available at http://localhost:{port}/docs")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
