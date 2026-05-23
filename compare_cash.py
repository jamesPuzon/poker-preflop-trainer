"""
Pixel-level comparison of Cash PDF charts vs cash_chart_data.json.
Saves side-by-side PNGs (PDF | Data | Diff) and prints any mismatches.
"""
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
import json, numpy as np, os

PDF_PATH  = 'Cash-100-Simple-Preflop-Ranges.pdf'
DATA_PATH = 'src/basic_cash_charts.json'
OUT_DIR   = 'cash_compare'
os.makedirs(OUT_DIR, exist_ok=True)

RANKS      = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
SCALE      = 3
COL_BOUNDS = [(40,817),(874,1651),(1709,2486)]
ROW_BOUND1 = (206, 844)
ROW_BOUND2 = (1049,1686)

PAGE_CHARTS = {
    2:  {'section':'Unopened pot',          'charts':['LJ','HJ','CO','BTN','SB'],'rows':[3,2]},
    3:  {'section':'Facing a raise',         'charts':['HJ vs LJ raise','CO vs LJ raise','BTN vs LJ raise','SB vs LJ raise','BB vs LJ raise','CO vs HJ raise'],'rows':[3,3]},
    4:  {'section':'Facing a raise',         'charts':['BTN vs HJ raise','SB vs HJ raise','BB vs HJ raise','BTN vs CO raise','SB vs CO raise','BB vs CO raise'],'rows':[3,3]},
    5:  {'section':'Facing a raise',         'charts':['SB vs BTN raise','BB vs BTN raise','BB vs SB raise'],'rows':[3]},
    6:  {'section':'Facing a 3-bet',         'charts':['LJ vs HJ 3-bet','LJ vs CO 3-bet','LJ vs BTN 3-bet','LJ vs SB 3-bet','LJ vs BB 3-bet','HJ vs CO 3-bet'],'rows':[3,3]},
    7:  {'section':'Facing a 3-bet',         'charts':['HJ vs BTN 3-bet','HJ vs SB 3-bet','HJ vs BB 3-bet','CO vs BTN 3-bet','CO vs SB 3-bet','CO vs BB 3-bet'],'rows':[3,3]},
    8:  {'section':'Facing a 3-bet',         'charts':['BTN vs SB 3-bet','BTN vs BB 3-bet','SB vs BB 3-bet'],'rows':[3]},
    9:  {'section':'Facing a 4-bet',         'charts':['HJ vs LJ 4-bet','CO vs LJ 4-bet','BTN vs LJ 4-bet','SB vs LJ 4-bet','BB vs LJ 4-bet','CO vs HJ 4-bet'],'rows':[3,3]},
    10: {'section':'Facing a 4-bet',         'charts':['BTN vs HJ 4-bet','SB vs HJ 4-bet','BB vs HJ 4-bet','BTN vs CO 4-bet','SB vs CO 4-bet','BB vs CO 4-bet'],'rows':[3,3]},
    11: {'section':'Facing a 4-bet',         'charts':['SB vs BTN 4-bet','BB vs BTN 4-bet','BB vs SB 4-bet'],'rows':[3]},
    12: {'section':'Facing an all-in 5-bet', 'charts':['LJ vs HJ 5-bet','LJ vs CO 5-bet','LJ vs BTN 5-bet','LJ vs SB 5-bet','LJ vs BB 5-bet','HJ vs CO 5-bet'],'rows':[3,3]},
    13: {'section':'Facing an all-in 5-bet', 'charts':['HJ vs BTN 5-bet','HJ vs SB 5-bet','HJ vs BB 5-bet','CO vs BTN 5-bet','CO vs SB 5-bet','CO vs BB 5-bet'],'rows':[3,3]},
    14: {'section':'Facing an all-in 5-bet', 'charts':['BTN vs SB 5-bet','BTN vs BB 5-bet','SB vs BB 5-bet'],'rows':[3]},
}

ACTION_RGB = {'raise':(255,73,97),'call':(47,223,117),'fold':(58,58,74)}

def classify(r,g,b):
    r,g,b=int(r),int(g),int(b)
    if r>190 and g<140 and b<140: return 'raise'
    if g>160 and r<130 and b<130: return 'call'
    if r>225 and g>225 and b>225: return 'none'
    return 'fold'

def sample_cell(arr,x0,y0,x1,y1):
    mx=(x1-x0)*.22; my=(y1-y0)*.22
    xs=np.linspace(x0+mx,x1-mx,5).astype(int)
    ys=np.linspace(y0+my,y1-my,5).astype(int)
    votes={}
    for px in xs:
        for py in ys:
            c=classify(*arr[py,px,:3])
            if c!='none': votes[c]=votes.get(c,0)+1
    return max(votes,key=votes.get) if votes else 'fold'

def cell_bounds_grid(x0,y0,x1,y1):
    w=(x1-x0)/13; h=(y1-y0)/13
    return [[(int(x0+c*w),int(y0+r*h),int(x0+(c+1)*w),int(y0+(r+1)*h))
             for c in range(13)] for r in range(13)]

with open(DATA_PATH) as f:
    chart_data = json.load(f)

doc = pdfium.PdfDocument(PDF_PATH)
all_corrections = {}
total_diffs = 0

for page_num, info in PAGE_CHARTS.items():
    arr = np.array(doc[page_num-1].render(scale=SCALE).to_pil())
    charts = info['charts']
    row_bounds = [ROW_BOUND1, ROW_BOUND2]
    chart_idx = 0

    for ri, n_cols in enumerate(info['rows']):
        y0,y1 = row_bounds[ri]
        for ci in range(n_cols):
            if chart_idx >= len(charts): break
            x0,x1 = COL_BOUNDS[ci]
            name   = charts[chart_idx]
            cells  = cell_bounds_grid(x0,y0,x1,y1)
            stored = chart_data.get(name,{}).get('hands',{})

            cw,ch    = x1-x0, y1-y0
            scale_o  = 200/max(cw,ch)
            ow,oh    = int(cw*scale_o), int(ch*scale_o)
            cw13,ch13= ow//13, oh//13

            pdf_img   = Image.fromarray(arr[y0:y1,x0:x1]).resize((ow,oh),Image.LANCZOS)
            recon_img = Image.new('RGB',(ow,oh),(30,30,50))
            diff_img  = Image.new('RGB',(ow,oh),(30,30,50))
            dr = ImageDraw.Draw(recon_img)
            dd = ImageDraw.Draw(diff_img)

            diffs = []
            for row in range(13):
                for col in range(13):
                    r1,r2 = RANKS[row],RANKS[col]
                    hand  = f'{r1}{r2}' if row==col else (f'{r1}{r2}s' if row<col else f'{r2}{r1}o')
                    cx0,cy0,cx1,cy1 = cells[row][col]
                    pdf_action    = sample_cell(arr,cx0,cy0,cx1,cy1)
                    stored_action = stored.get(hand,'fold')

                    rx0,ry0 = col*cw13, row*ch13
                    rx1,ry1 = rx0+cw13, ry0+ch13
                    dr.rectangle([rx0,ry0,rx1,ry1], fill=ACTION_RGB[stored_action])

                    if pdf_action != stored_action and pdf_action != 'none':
                        diffs.append((hand, stored_action, pdf_action))
                        dd.rectangle([rx0,ry0,rx1,ry1], fill=(255,220,0))
                    else:
                        dd.rectangle([rx0,ry0,rx1,ry1], fill=ACTION_RGB[pdf_action])

            combined = Image.new('RGB',(ow*3+4, oh+20),(20,20,35))
            combined.paste(pdf_img,   (0,20))
            combined.paste(recon_img, (ow+2,20))
            combined.paste(diff_img,  (ow*2+4,20))
            draw_c = ImageDraw.Draw(combined)
            draw_c.text((2,2),     'PDF',  fill=(200,200,255))
            draw_c.text((ow+4,2),  'Data', fill=(200,200,255))
            draw_c.text((ow*2+6,2),'Diff (yellow=mismatch)', fill=(255,220,50))

            safe = name.replace(' ','_').replace('/','_')
            combined.save(f'{OUT_DIR}/{page_num:02d}_{safe}.png')

            if diffs:
                total_diffs += len(diffs)
                all_corrections[name] = {hand:new for hand,_,new in diffs}
                print(f'{name} — {len(diffs)} diff(s):')
                for hand,old,new in diffs:
                    print(f'  {hand}: stored={old}  pdf={new}')

            chart_idx += 1

if total_diffs == 0:
    print('All cells match — no corrections needed.')
else:
    print(f'\nTotal: {total_diffs} cells differ across {len(all_corrections)} charts')
    # Apply corrections
    for name, fixes in all_corrections.items():
        for hand, action in fixes.items():
            chart_data[name]['hands'][hand] = action
    with open(DATA_PATH,'w') as f:
        json.dump(chart_data, f, indent=2)
    print(f'Corrections written to {DATA_PATH}')

print(f'\nComparison images saved to {OUT_DIR}/')
