import pdfplumber
import json

with pdfplumber.open('C:/Users/james/OneDrive/Documents/PersonalProjects/poker-preflop-trainer/MTT-100-Simple-Preflop-Ranges.pdf') as pdf:
    print(f'Total pages: {len(pdf.pages)}')

    # Look at page 2 in detail - it has 5 charts (LJ, HJ, CO, BTN, SB)
    for page_num in range(2, 14):
        page = pdf.pages[page_num - 1]
        print(f'\n=== PAGE {page_num} ===')
        text = page.extract_text()
        print(f'Text: {text[:200] if text else "(none)"}')
        print(f'Images: {len(page.images)}')
        print(f'Rects: {len(page.rects)}')

        # Check rects for colored cells
        if page.rects:
            print('Sample rects:')
            for r in page.rects[:5]:
                print(f'  {r}')
