"""Pull the discussion questions out of CISA's Water and Wastewater Systems CTEP
Situation Manual (.docx, public domain) into inputs/ctep-water-questions.json.
The curated subset tagged to CPG 2.0 goals is inputs/interview-questions.csv.

    python -I -X utf8 extract/ctep-questions.py --src <the CTEP .docx> --out inputs
"""
import argparse, json, os, zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
QUESTION_SECTIONS = {
    'Discussion Questions', 'Cyber Resilience', 'Accounts & Privileges', 'Incident Identification',
    'Incident Response', 'Recovery', 'Training & Exercises', 'Senior Leaders', 'Public Information', 'Legal',
}


def extract(path):
    root = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml'))
    module, section, questions = None, None, []
    for p in root.iter(W + 'p'):
        st = p.find(W + 'pPr/' + W + 'pStyle')
        style = (st.get(W + 'val') if st is not None else '') or ''
        text = ''.join(t.text or '' for t in p.iter(W + 't')).strip()
        if not text:
            continue
        if style.lower().startswith('heading'):
            if text.startswith('Module'):
                module = text
            if text.startswith('Appendix'):
                module = text.split(':')[0]
            section = text if text in QUESTION_SECTIONS else None
            continue
        if section and len(text) > 20 and (text.endswith('?') or style.lower().startswith('list')):
            label = module if section == 'Discussion Questions' else section
            questions.append({'section': label, 'question': text})
    return questions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    questions = extract(a.src)
    os.makedirs(a.out, exist_ok=True)
    out = os.path.join(a.out, 'ctep-water-questions.json')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({
            'source': 'CISA Water and Wastewater Systems Cybersecurity Tabletop Exercise Package (CTEP) Situation Manual, November 2023 (public domain)',
            'questions': questions,
        }, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{out}: {len(questions)} questions')


if __name__ == '__main__':
    main()
