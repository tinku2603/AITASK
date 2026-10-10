import asyncio
import sys
from backend.database import fetch_expenses, save_expense, update_expense
from backend.agents.orchestrator import process_expense_pipeline

async def run_tests():
    print("=== TESTING PYTHON BACKEND ===")
    
    # 1. Test database save & fetch
    test_id = "test-py-12345"
    print("1. Testing save_expense...")
    saved = save_expense({
        "id": test_id,
        "user_id": "emp_402",
        "bill_type": "CAB_LOCAL",
        "bill_date": "2026-10-11",
        "vendor_name": "Python Test Cab",
        "total_amount": 350.0,
        "status": "Draft",
        "confidence_score": 0.99, # Ensure confidence_score does NOT break schema!
        "validation_errors": ["dummy error"]
    })
    print(f"Saved: {saved['id']}, status: {saved['status']}, vendor: {saved['vendor_name']}")
    assert saved["id"] == test_id
    assert saved["vendor_name"] == "Python Test Cab"

    print("2. Testing fetch_expenses...")
    expenses = fetch_expenses("emp_402")
    found = any(e["id"] == test_id for e in expenses)
    print(f"Found saved expense in fetch_expenses: {found}")
    assert found

    print("3. Testing update_expense...")
    updated = update_expense(test_id, {"status": "Pending Approval"})
    print(f"Updated status: {updated['status']}")
    assert updated["status"] == "Pending Approval"

    print("4. Testing multi-agent pipeline with mock cab slip...")
    pipeline_res = await process_expense_pipeline(
        files=[{"name": "uber_test.png", "mimeType": "image/png", "base64Data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}],
        user_prompt="Process cab slip",
        user_id="emp_402",
        auto_submit=False
    )
    print(f"Pipeline result success: {pipeline_res['success']}")
    print(f"Extracted expenses count: {len(pipeline_res['extractedExpenses'])}")
    print(f"Draft cards count: {len(pipeline_res['draftCards'])}")
    assert pipeline_res["success"]
    assert len(pipeline_res["extractedExpenses"]) >= 1

    print("=== ALL PYTHON BACKEND TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    asyncio.run(run_tests())
