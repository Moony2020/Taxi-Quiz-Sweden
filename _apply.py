# -*- coding: utf-8 -*-
"""
Apply PDF-reconstructed text to data.js for LAGSTIFNING-1..4.
Preserves: id, no, source, group, page, correct, and image-choice options
(pages where rebuild returns <2 options, e.g. Q23/Q51/Q98).
"""
import json, re, sys

BASE = r'C:\Users\Mymoon Dobaibi\OneDrive - Linnéuniversitetet\Desktop\Mixed\Projects-Codes\taxi-quiz-sweden'

# Load existing questions from data.js
with open(f'{BASE}\\data.js', encoding='utf-8') as f:
    src = f.read()

m = re.search(r'window\.QUESTIONS\s*=\s*(\[.*\])\s*;', src, re.DOTALL)
if not m:
    print('ERROR: could not find window.QUESTIONS in data.js')
    sys.exit(1)

questions = json.loads(m.group(1))
print(f'Loaded {len(questions)} questions from data.js')

# Load all 4 rebuild JSONs
rebuilds = {}
for n in range(1, 5):
    with open(f'{BASE}\\_rb_{n}.json', encoding='utf-8') as f:
        rebuilds[n] = json.load(f)
    print(f'Loaded _rb_{n}.json: {len(rebuilds[n])} pages')

# Image-choice question ids to always preserve options
IMAGE_CHOICE_IDS = {23, 51, 98}  # Bild A/B/C, Vägmärke A-D, Blad A-D

target_groups = {'LAGSTIFNING-1': 1, 'LAGSTIFNING-2': 2, 'LAGSTIFNING-3': 3, 'LAGSTIFNING-4': 4}

updated = 0
skipped_image_choice = 0
skipped_no_rebuild = 0

for q in questions:
    grp = q.get('group', '')
    if grp not in target_groups:
        continue

    n = target_groups[grp]
    page = str(q.get('page', ''))
    rb = rebuilds[n]

    if page not in rb:
        skipped_no_rebuild += 1
        continue

    rb_page = rb[page]
    rb_q = rb_page.get('question', '').strip()
    rb_opts = rb_page.get('options', {})

    # Skip image-choice questions — preserve their manually-added options
    if q['id'] in IMAGE_CHOICE_IDS:
        if rb_q:
            q['question'] = rb_q
        skipped_image_choice += 1
        continue

    # If rebuild gives <2 options this is an image-choice page — don't overwrite
    if len(rb_opts) < 2:
        skipped_image_choice += 1
        continue

    # Apply rebuilt text
    if rb_q:
        q['question'] = rb_q

    q['options'] = [{'key': k, 'text': v} for k, v in sorted(rb_opts.items())]
    updated += 1

print(f'Updated: {updated}, image-choice preserved: {skipped_image_choice}, no-rebuild: {skipped_no_rebuild}')

# Rewrite data.js
new_json = json.dumps(questions, ensure_ascii=False, indent=2)
new_src = src[:m.start(1)] + new_json + src[m.end(1):]

with open(f'{BASE}\\data.js', 'w', encoding='utf-8') as f:
    f.write(new_src)

print('data.js rewritten successfully.')
