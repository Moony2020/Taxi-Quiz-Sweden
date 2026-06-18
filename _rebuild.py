# -*- coding: utf-8 -*-
import fitz, sys, json, re
PDF_DIR = r'C:\Users\Mymoon Dobaibi\OneDrive - Linnéuniversitetet\Desktop\Taxi-original'

def reconstruct_lines(page):
    chars = []
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for s in l.get('spans', []):
                for c in s.get('chars', []):
                    x0, y0, x1, y1 = c['bbox']
                    chars.append(((y0 + y1) / 2, x0, x1, c['c']))
    chars.sort(key=lambda t: (t[0], t[1]))
    lines = {}
    for y, x0, x1, ch in chars:
        key = next((k for k in lines if abs(k - y) <= 3), None)
        if key is None:
            key = y; lines[key] = []
        lines[key].append((x0, x1, ch))
    out = []
    for y in sorted(lines):
        row = sorted(lines[y], key=lambda t: t[0])
        s = ''; px0 = px1 = None; pch = None
        for x0, x1, ch in row:
            w = x1 - x0
            if pch is not None and ch == pch and (x0 - px0) < w * 0.5:
                continue
            if px1 is not None and x0 - px1 > 1.2:
                s += ' '
            s += ch; px0, px1, pch = x0, x1, ch
        s = re.sub(r'\s+', ' ', s).strip()
        if s:
            out.append(s)
    return out

OPT_RE = re.compile(r'^([A-F])[\.\)]\s*(.*)$')
QNUM_RE = re.compile(r'^(\d+)[\.\)]\s*(.*)$')

def parse_page(lines):
    qparts = []; options = {}; cur = None; started = False
    for text in lines:
        if re.fullmatch(r'[A-F]', text.strip()):
            cur = 'STOP'; continue
        if cur == 'STOP':
            continue
        mq = QNUM_RE.match(text); mo = OPT_RE.match(text)
        if mq and not started:
            started = True; cur = 'Q'; qparts.append(mq.group(2))
        elif mo and started:
            cur = mo.group(1); options.setdefault(cur, []).append(mo.group(2))
        elif started:
            if cur == 'Q': qparts.append(text)
            elif cur in options: options[cur].append(text)
    q = ' '.join(p for p in qparts if p).strip()
    opts = {k: ' '.join(v).strip() for k, v in options.items()}
    return q, opts

num = sys.argv[1]
doc = fitz.open(f'{PDF_DIR}\\LAGSTIFNING-{num}.pdf')
result = {}
for pno in range(len(doc)):
    q, opts = parse_page(reconstruct_lines(doc[pno]))
    result[pno + 1] = {'question': q, 'options': opts}
with open(f'_rb_{num}.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
print(f'wrote _rb_{num}.json')
