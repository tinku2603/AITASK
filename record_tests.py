import asyncio
import os
import glob
import random
from playwright.async_api import async_playwright

async def run_scenario_recordings():
    output_dir = os.path.abspath("test_recordings")
    os.makedirs(output_dir, exist_ok=True)
    test_bills_dir = os.path.abspath("test_bills")

    # Clean old webm videos
    for f in glob.glob(os.path.join(output_dir, "*.webm")):
        try:
            os.remove(f)
        except Exception:
            pass

    print(f"🎬 Starting Playwright video recording with test_bills -> {output_dir}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            record_video_dir=output_dir,
            record_video_size={"width":1440, "height": 900},
            viewport={"width": 1440, "height": 900}
        )
        page = await context.new_page()

        # 1. Navigate to portal
        print("Navigating to http://localhost:3000 ...")
        await page.goto("http://localhost:3000", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # -----------------------------------------------------------------
        # SCENARIO 1: Upload CAB_RECEIPT.pdf from test_bills
        # -----------------------------------------------------------------
        cab_pdf_path = os.path.join(test_bills_dir, "CAB_RECEIPT.pdf")
        if os.path.exists(cab_pdf_path):
            print(f"Testing Scenario 1: Upload {os.path.basename(cab_pdf_path)} ...")
            file_input = page.locator("input[type='file']")
            await file_input.set_input_files(cab_pdf_path)
            await page.wait_for_timeout(1500)

            # Split preview opens automatically - inspect PDF preview
            print("Inspecting PDF preview in split viewer...")
            await page.wait_for_timeout(3000)

            prompt_input = page.locator("input[placeholder*='Attach a receipt PDF/image or type instructions...']").first
            await prompt_input.fill("Extract cab receipt details and prepare claim.")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(7000)

            # Submit draft if present
            direct_submit_btn = page.locator("button:has-text('[Submit Directly to ERP]')").first
            if await direct_submit_btn.is_visible():
                await direct_submit_btn.click()
                await page.wait_for_timeout(2500)

        # -----------------------------------------------------------------
        # SCENARIO 2: Upload FoodBill_1.png from test_bills
        # -----------------------------------------------------------------
        food_img_path = os.path.join(test_bills_dir, "FoodBill_1.png")
        if os.path.exists(food_img_path):
            print(f"Testing Scenario 2: Upload {os.path.basename(food_img_path)} ...")
            file_input = page.locator("input[type='file']")
            await file_input.set_input_files(food_img_path)
            await page.wait_for_timeout(1500)

            # View image in split preview
            await page.wait_for_timeout(2500)

            prompt_input = page.locator("input[placeholder*='Attach a receipt PDF/image or type instructions...']").first
            await prompt_input.fill("Process restaurant lunch food bill.")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(7000)

            # Submit draft if present
            direct_submit_btn = page.locator("button:has-text('[Submit Directly to ERP]')").first
            if await direct_submit_btn.is_visible():
                await direct_submit_btn.click()
                await page.wait_for_timeout(2500)

        # -----------------------------------------------------------------
        # SCENARIO 3: Upload Fuel1306.pdf from test_bills
        # -----------------------------------------------------------------
        fuel_pdf_path = os.path.join(test_bills_dir, "Fuel1306.pdf")
        if os.path.exists(fuel_pdf_path):
            print(f"Testing Scenario 3: Upload {os.path.basename(fuel_pdf_path)} ...")
            file_input = page.locator("input[type='file']")
            await file_input.set_input_files(fuel_pdf_path)
            await page.wait_for_timeout(1500)
            await page.wait_for_timeout(2500)

            prompt_input = page.locator("input[placeholder*='Attach a receipt PDF/image or type instructions...']").first
            await prompt_input.fill("Process fuel reimbursement receipt.")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(7000)

            direct_submit_btn = page.locator("button:has-text('[Submit Directly to ERP]')").first
            if await direct_submit_btn.is_visible():
                await direct_submit_btn.click()
                await page.wait_for_timeout(2500)

        # -----------------------------------------------------------------
        # SCENARIO 4: Blurry / Missing Metadata with HITL Mediation
        # Randomly choose Uber/Rapido and value as Rs. 199 as requested
        # -----------------------------------------------------------------
        may_img_path = os.path.join(test_bills_dir, "5may.jpg")
        print(f"Testing Scenario 4: Triggering HITL missing metadata with {os.path.basename(may_img_path)} ...")
        if os.path.exists(may_img_path):
            file_input = page.locator("input[type='file']")
            await file_input.set_input_files(may_img_path)
            await page.wait_for_timeout(1500)

        prompt_input = page.locator("input[placeholder*='Attach a receipt PDF/image or type instructions...']").first
        await prompt_input.fill("Analyze this receipt where date and vendor amount are blurry or missing.")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(7000)

        # When prompted for human in loop, choose randomly from Uber/Rapido and Rs. 199
        vendor_choice = random.choice(["Uber", "Rapido"])
        print(f"HITL triggered: Randomly filling vendor='{vendor_choice}' and amount='199'...")

        vendor_input = page.locator("input[placeholder*='Swiggy'], input[placeholder*='e.g.']").first
        if await vendor_input.is_visible():
            await vendor_input.fill(vendor_choice)
            await page.wait_for_timeout(500)

        amount_input = page.locator("input[placeholder*='450.00'], input[placeholder*='1850.00'], input[type='number']").first
        if await amount_input.is_visible():
            await amount_input.fill("199")
            await page.wait_for_timeout(500)

        # Hit Submit to ERP
        submit_erp_btn = page.locator("button:has-text('Save & Submit to ERP'), button:has-text('Submit Corrected Data')").first
        if await submit_erp_btn.is_visible():
            print("Clicking Submit to ERP on HITL Card...")
            await submit_erp_btn.click()
            await page.wait_for_timeout(3000)

        # -----------------------------------------------------------------
        # SCENARIO 5: Navigate to Claims Dashboard and verify all claims
        # -----------------------------------------------------------------
        print("Navigating to Claims Dashboard...")
        dashboard_tab = page.locator("button:has-text('Claims Dashboard')")
        if await dashboard_tab.is_visible():
            await dashboard_tab.click()
            await page.wait_for_timeout(4000)

            # Search for the newly resolved claim
            search_input = page.locator("input[placeholder*='Search claims']").first
            if await search_input.is_visible():
                await search_input.fill(vendor_choice)
                await page.wait_for_timeout(2500)
                await search_input.fill("")
                await page.wait_for_timeout(2000)

        # -----------------------------------------------------------------
        # SCENARIO 6: Switch back to Agent Chat to verify persistent state
        # -----------------------------------------------------------------
        print("Returning to Agent Chat...")
        chat_tab = page.locator("button:has-text('Agent Chat')")
        if await chat_tab.is_visible():
            await chat_tab.click()
            await page.wait_for_timeout(3000)

        print("Wrapping up Playwright test recording...")
        await page.wait_for_timeout(2000)
        await context.close()
        await browser.close()

    videos = glob.glob(os.path.join(output_dir, "*.webm"))
    print(f"✅ Video recorded successfully: {videos}")

if __name__ == "__main__":
    asyncio.run(run_scenario_recordings())
