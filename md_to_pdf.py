#!/usr/bin/env python3
"""
Convert Markdown to Professional PDF with Custom Cover Page using Playwright & Chromium.

Usage:
    ./venv/bin/python md_to_pdf.py [input_markdown] [output_pdf]

Examples:
    ./venv/bin/python md_to_pdf.py TECHNICAL_DESIGN_DOCUMENT.md Technical_Design_Document.pdf
"""

import sys
import os
import asyncio
import markdown
from playwright.async_api import async_playwright

COVER_PAGE_HTML = """
<div class="cover-page">
    <div class="cover-content">
        <div class="lab-badge">AI INNOVATION LAB</div>
        <h1 class="cover-title">AI Innovation Lab Session 2</h1>
        <div class="cover-subtitle">Autonomous Expense Tracker & Reimbursement Platform</div>
    </div>
    <div class="cover-footer">
        <p class="submitted-by">Submitted by: <strong>Srinath</strong></p>
        <p class="emp-id">Employee ID: <strong>[EMP_ID_PLACEHOLDER]</strong></p>
        <p class="date">Date: October 2026</p>
    </div>
</div>
<div class="page-break"></div>
"""

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Technical Document</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

    @page {
        size: A4;
        margin: 20mm 18mm 20mm 18mm;
    }

    * {
        box-sizing: border-box;
    }

    body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 10.5pt;
        line-height: 1.6;
        color: #1e293b;
        margin: 0;
        padding: 0;
    }

    /* Cover Page Styling */
    .cover-page {
        height: 100vh;
        max-height: 250mm;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        text-align: center;
        padding: 60px 20px 40px 20px;
    }

    .cover-content {
        margin-top: auto;
        margin-bottom: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .lab-badge {
        display: inline-block;
        padding: 6px 16px;
        background: #eef2ff;
        color: #4f46e5;
        border: 1px solid #c7d2fe;
        border-radius: 9999px;
        font-size: 11pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 24px;
    }

    .cover-title {
        font-size: 32pt;
        font-weight: 800;
        color: #0f172a;
        margin: 0 0 16px 0;
        line-height: 1.2;
        letter-spacing: -0.02em;
    }

    .cover-subtitle {
        font-size: 14pt;
        font-weight: 500;
        color: #64748b;
        max-width: 600px;
    }

    .cover-footer {
        width: 100%;
        border-top: 1px solid #e2e8f0;
        padding-top: 24px;
        text-align: center;
        font-size: 11pt;
        color: #334155;
    }

    .cover-footer p {
        margin: 4px 0;
    }

    .page-break {
        page-break-after: always;
        break-after: page;
    }

    /* Markdown Document Content */
    .markdown-body {
        padding-top: 10px;
    }

    h1, h2, h3, h4 {
        color: #0f172a;
        font-weight: 700;
        line-height: 1.3;
    }

    h1 {
        font-size: 20pt;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 8px;
        margin-top: 28px;
        margin-bottom: 16px;
    }

    h2 {
        font-size: 15pt;
        border-bottom: 1px solid #f1f5f9;
        padding-bottom: 6px;
        margin-top: 24px;
        margin-bottom: 12px;
    }

    h3 {
        font-size: 12.5pt;
        margin-top: 20px;
        margin-bottom: 8px;
    }

    p {
        margin: 10px 0;
    }

    code {
        font-family: 'JetBrains Mono', Consolas, monospace;
        font-size: 9pt;
        background: #f1f5f9;
        color: #0f172a;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
    }

    pre {
        background: #0f172a;
        color: #f8fafc;
        padding: 14px 18px;
        border-radius: 8px;
        overflow-x: auto;
        font-family: 'JetBrains Mono', monospace;
        font-size: 8.5pt;
        line-height: 1.45;
        margin: 14px 0;
    }

    pre code {
        background: transparent;
        color: inherit;
        padding: 0;
        border: none;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin: 16px 0;
        font-size: 9.5pt;
    }

    th, td {
        border: 1px solid #cbd5e1;
        padding: 8px 12px;
        text-align: left;
    }

    th {
        background: #f8fafc;
        font-weight: 600;
        color: #334155;
    }

    tr:nth-child(even) {
        background: #f8fafc;
    }

    blockquote {
        margin: 14px 0;
        padding: 10px 18px;
        background: #f8fafc;
        border-left: 4px solid #6366f1;
        color: #475569;
        font-style: italic;
    }

    hr {
        border: none;
        border-top: 1px solid #e2e8f0;
        margin: 24px 0;
    }

    ul, ol {
        padding-left: 24px;
        margin: 10px 0;
    }

    li {
        margin-bottom: 4px;
    }
</style>
</head>
<body>
    {COVER_PAGE}
    <div class="markdown-body">
        {BODY_CONTENT}
    </div>
</body>
</html>
"""

async def convert_md_to_pdf(md_path: str, pdf_path: str):
    if not os.path.exists(md_path):
        print(f"❌ Error: File not found: {md_path}")
        sys.exit(1)

    print(f"📖 Reading markdown file: {md_path}...")
    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    # Convert markdown to html with tables and fenced code blocks
    html_content = markdown.markdown(
        md_text,
        extensions=["fenced_code", "tables", "nl2br", "sane_lists"]
    )

    full_html = HTML_TEMPLATE.replace("{COVER_PAGE}", COVER_PAGE_HTML).replace("{BODY_CONTENT}", html_content)

    temp_html_path = md_path + ".temp.html"
    with open(temp_html_path, "w", encoding="utf-8") as f:
        f.write(full_html)

    print("🚀 Launching Chromium to generate PDF...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Load the HTML file
        await page.goto(f"file://{os.path.abspath(temp_html_path)}", wait_until="networkidle")
        
        # Print to PDF with headers, footers and page numbering
        await page.pdf(
            path=pdf_path,
            format="A4",
            print_background=True,
            margin={
                "top": "15mm",
                "bottom": "18mm",
                "left": "15mm",
                "right": "15mm"
            },
            display_header_footer=True,
            header_template="<div></div>",
            footer_template="""
            <div style="font-size: 8pt; color: #94a3b8; font-family: Inter, sans-serif; width: 100%; display: flex; justify-content: space-between; padding: 0 15mm;">
                <span>AI Innovation Lab Session 2 - Technical Document</span>
                <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
            </div>
            """
        )
        await browser.close()

    if os.path.exists(temp_html_path):
        os.remove(temp_html_path)

    print(f"✅ Successfully created PDF: {pdf_path}")

if __name__ == "__main__":
    input_file = sys.argv[1] if len(sys.argv) > 1 else "TECHNICAL_DESIGN_DOCUMENT.md"
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace(".md", ".pdf")
    asyncio.run(convert_md_to_pdf(input_file, output_file))
