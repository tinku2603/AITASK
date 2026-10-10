// Automated Verification Script for Agentic Multi-Agent Pipeline
// Run with: node scripts/verify-pipeline.mjs

import { runExtractionAgent } from "../src/lib/agents/extractionAgent.ts";
import { runDeduplicationAgent } from "../src/lib/agents/deduplicationAgent.ts";
import { processExpensePipeline } from "../src/lib/agents/orchestrator.ts";

console.log("==================================================");
console.log("🧪 RUNNING AGENTIC PIPELINE VERIFICATION SUITE");
console.log("==================================================\n");

async function runTests() {
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
    }
  }

  // 1. TEST CASE A: Pristine Cab Slip Upload (First submission for a user)
  console.log("--- TEST CASE A: Pristine Cab Slip Upload ---");
  const testUserId = "emp_test_" + Date.now();
  const cleanCabResult = await processExpensePipeline({
    files: [{ mimeType: "image/png", base64Data: "mock-base64" }],
    userPrompt: "Process clean cab slip",
    userId: testUserId,
    autoSubmit: true,
    llmConfig: { provider: "mock" },
  });

  assert(cleanCabResult.extractedExpenses.length === 1, "Extracted exactly 1 expense item");
  assert(cleanCabResult.submittedExpenses.length === 1, "Pristine cab expense submitted straight to ERP");
  assert(
    cleanCabResult.submittedExpenses[0]?.status === "Pending Approval",
    "Submitted expense status is straight to 'Pending Approval'"
  );

  // 1.1 TEST DRAFT CHOICE OPTION: View Draft vs Submit Directly
  console.log("\n--- TEST: Draft Option (Review vs Submit Directly) ---");
  const draftChoiceResult = await processExpensePipeline({
    files: [{ mimeType: "image/png", base64Data: "mock-base64" }],
    userPrompt: "Process clean cab slip in interactive mode",
    userId: "emp_draft_user_" + Date.now(),
    autoSubmit: false, // Default chat behavior
    llmConfig: { provider: "mock" },
  });

  assert(draftChoiceResult.draftCards.length === 1, "Agent generated Draft choice card for user review");
  assert(
    draftChoiceResult.draftCards[0].expense_data.status === "Draft",
    "Expense saved as Draft awaiting user decision"
  );

  // 2. TEST CASE B: Consecutive Duplicate Bill Submission (Identical copy submitted consecutively)
  console.log("\n--- TEST CASE B: Submitting Duplicate Copy Consecutively ---");
  const duplicateResult = await processExpensePipeline({
    files: [{ mimeType: "image/png", base64Data: "mock-base64" }],
    userPrompt: "Process exact duplicate cab slip",
    userId: testUserId, // Same user, same date, same vendor
    llmConfig: { provider: "mock" },
  });

  assert(
    duplicateResult.duplicateWarnings.length > 0 || duplicateResult.hitlCards.length > 0,
    "Duplicate detected immediately: blocked as definite duplicate or sent to HITL review"
  );

  // 3. CORNER CASE 1: The 'Round Trip Cab' Dilemma
  console.log("\n--- CORNER CASE 1: Round Trip Cab Dilemma ---");
  const roundTripResult = await processExpensePipeline({
    files: [{ mimeType: "image/png", base64Data: "mock-base64" }],
    userPrompt: "Return cab trip back to office from Whitefield",
    userId: "emp_402",
    autoSubmit: true,
    llmConfig: { provider: "mock" },
  });

  const isRoundTripEvent = roundTripResult.events.some((e) => e.step === "ROUND_TRIP_EVALUATION");
  assert(isRoundTripEvent, "Agent 2 triggered ROUND_TRIP_EVALUATION on inverted route");
  assert(
    roundTripResult.submittedExpenses.length === 1,
    "Round trip bypassed duplicate block and submitted to ERP"
  );
  assert(
    roundTripResult.submittedExpenses[0].remarks.includes("Round Trip"),
    "Remarks explicitly labeled with 'Round Trip'"
  );

  // 4. CORNER CASE 2: Multi-Page Grouped Documents
  console.log("\n--- CORNER CASE 2: Multi-Page Grouped Documents ---");
  const multiPageResult = await processExpensePipeline({
    files: [
      { mimeType: "application/pdf", base64Data: "mock-p1" },
      { mimeType: "application/pdf", base64Data: "mock-p2" },
    ],
    userPrompt: "Process multi-page invoice with flight and lunch",
    userId: "emp_402",
    llmConfig: { provider: "mock" },
  });

  assert(multiPageResult.extractedExpenses.length === 2, "Extracted array of 2 distinct expenses (Flight & Food)");

  // 5. CORNER CASE 3: Missing Structural Metadata (Blurry bill)
  console.log("\n--- CORNER CASE 3: Blurry Missing Metadata ---");
  const blurryResult = await processExpensePipeline({
    files: [{ mimeType: "image/jpeg", base64Data: "mock-blur" }],
    userPrompt: "Process blurry illegible receipt",
    userId: "emp_402",
    llmConfig: { provider: "mock" },
  });

  assert(blurryResult.hitlCards.length === 1, "Agent 3 HITL card created for user input");
  assert(
    blurryResult.hitlCards[0].reason === "MISSING_METADATA",
    "Card reason correctly identified as MISSING_METADATA"
  );

  console.log("\n==================================================");
  console.log(`📊 TEST SUITE SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("==================================================");
}

runTests().catch(console.error);
