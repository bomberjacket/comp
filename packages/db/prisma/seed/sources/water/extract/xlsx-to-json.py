"""Turn the EPA water-sector workbooks (public domain, US EPA / CISA) into the JSON inputs
of the water framework generator. Pure zipfile + XML: no macros run, nothing executed.

    python -I -X utf8 extract/xlsx-to-json.py --src <folder with the three .xlsx> --out inputs

Expected files in --src (names as downloaded from epa.gov / cisa.gov):
  epa-water-cybersecurity-assessment-tool-3.1_links.xlsx          -> inputs/wcat-3.1.json
  epa-cybersecurity-procurement-evaluation-checklist_06012026_1.xlsx -> inputs/epa-procurement-checklist.json
  20230320-CSF-aligned-Consolidated-Component-Listing.xlsx        -> inputs/cpg-1.0.1-components.json
"""
import argparse, json, os, re, zipfile
import xml.etree.ElementTree as ET

NS = {
    's': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
}
WCAT_FILE = 'epa-water-cybersecurity-assessment-tool-3.1_links.xlsx'
PROCUREMENT_FILE = 'epa-cybersecurity-procurement-evaluation-checklist_06012026_1.xlsx'
CPG_FILE = '20230320-CSF-aligned-Consolidated-Component-Listing.xlsx'


def col_index(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_workbook(path):
    """{sheet name: [[cell, ...], ...]} with '' for empty cells (positional)."""
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['s'])))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = {r.get('Id'): r.get('Target') for r in rels.findall('rel:Relationship', NS)}
    sheets = {}
    for sh in wb.find('s:sheets', NS):
        t = target[sh.get('{%s}id' % NS['r'])]
        t = t if t.startswith('xl/') else 'xl/' + t.lstrip('/')
        rows = []
        for row in ET.fromstring(z.read(t)).iter('{%s}row' % NS['s']):
            cells = {}
            for c in row.findall('s:c', NS):
                v, is_ = c.find('s:v', NS), c.find('s:is', NS)
                if v is not None:
                    val = shared[int(v.text)] if c.get('t') == 's' else (v.text or '')
                elif is_ is not None:
                    val = ''.join(x.text or '' for x in is_.iter('{%s}t' % NS['s']))
                else:
                    continue
                cells[col_index(c.get('r'))] = val.strip()
            rows.append([cells.get(i, '') for i in range(max(cells) + 1)] if cells else [])
        sheets[sh.get('name')] = rows
    return sheets


def clean(s):
    return re.sub(r'[ \t]+', ' ', s.replace('\r', '')).strip()


def wcat(sheets):
    # The visible workbook merges the function name across its block; the hidden
    # pivot source carries function and number on every row. Fact sheet links live
    # only in the visible sheet, joined by checklist number.
    factsheet = {}
    for r in sheets['Assessment Workbook']:
        if len(r) > 8 and re.match(r'^\d\.[A-Z]\.?$', r[3]):
            factsheet[r[3].rstrip('.')] = clean(r[8])
    items = []
    for r in sheets['_DataTable']:
        if len(r) > 5 and re.match(r'^\d\.[A-Z]\.?$', r[2]) and r[1] != '0':
            items.append({
                'id': r[2].rstrip('.'),
                'function': clean(r[0]),
                'functionNumber': int(r[1]),
                'question': clean(r[3]).rstrip('*').strip(),
                'epaPriority': r[3].rstrip().endswith('*'),
                'recommendation': clean(r[5]),
                'factsheetUrl': factsheet.get(r[2].rstrip('.'), ''),
            })
    assert len(items) == 33, len(items)
    return {
        'source': 'EPA Water Cybersecurity Assessment Tool (WCAT) 3.1, EPA Cybersecurity Checklist for Drinking Water and Wastewater Systems (public domain)',
        'answerOptions': ['Yes', 'No', 'In Progress', 'Not Applicable'],
        'items': items,
    }


def procurement(sheets):
    def blocks(rows, fallback_sections):
        """Items sit under a header row ('Questions' | 'Example Responses' | ...). The
        section name is the single-cell row just above that header (GOVERN, PROTECT, ...);
        a block without one takes the next unused name from the workbook's summary table."""
        out, cols, current, last_single, used = [], None, None, None, 0
        for r in rows:
            cells = [(i, c) for i, c in enumerate(r) if c]
            if not cells:
                continue
            if len(cells) == 1 and not cells[0][1].startswith('Total'):
                last_single = clean(cells[0][1])
                continue
            if any(c == 'Questions' for _, c in cells):
                cols = {name: i for i, name in cells}
                base = cols['Questions']
                if last_single and len(last_single) < 40:
                    current = last_single.title().replace('Msp', 'MSP').replace('By Design', 'by Design')
                else:
                    current = fallback_sections[used] if used < len(fallback_sections) else None
                used = fallback_sections.index(current) + 1 if current in fallback_sections else used
                last_single = None
                continue
            if cols is None or current is None:
                continue
            base = cols['Questions']
            q = clean(r[base]) if base < len(r) else ''
            if not q or q.startswith(('Total', 'Section')):
                continue
            if len(q) < 40 and not q.endswith('?'):
                # A section banner (PROTECT, SECURE BY DESIGN) spans merged cells, so it
                # is not single-cell; summary-table rows (Govern | 0 | 0) are skipped.
                if q.isupper():
                    current = q.title().replace('Msp', 'MSP').replace('By Design', 'by Design')
                    last_single = current
                continue
            get = lambda name: clean(r[cols[name]]) if name in cols and cols[name] < len(r) else ''
            out.append({
                'section': current,
                'question': q,
                'exampleResponse': get('Example Responses'),
                'recommendation': get('Recommendations'),
                'referenceUrl': get('Reference guidance'),
            })
        return out

    supplier = blocks(
        sheets['Cybersecurity Procurement Evalu'],
        ['Govern', 'Identify', 'Protect', 'Detect', 'Recover', 'Response', 'Secure by Design'],
    )
    integrator = blocks(
        sheets['Integrator-MSP Checklist'],
        ['Integrator/MSP Infrastructure', 'Secure Remote Access', 'Vulnerability Management', 'Incident Response'],
    )
    for kind, items in (('supplier', supplier), ('integrator', integrator)):
        for i, it in enumerate(items, 1):
            it['id'] = f"{'S' if kind == 'supplier' else 'M'}-{i:02d}"
    return {
        'source': 'EPA Cybersecurity Procurement Evaluation Checklist for Drinking Water and Wastewater Systems, version 1.0 (10/14/2025), public domain',
        'weightScale': {'0': 'Not applicable', '1': 'Low', '2': 'Medium', '3': 'High'},
        'scoreScale': {'0': 'No response / not met', '1': 'Partially met', '2': 'Mostly met', '3': 'Fully met'},
        'checklists': [
            {'kind': 'epa_supplier', 'name': 'Water Sector Cybersecurity Procurement Evaluation Checklist', 'items': supplier},
            {'kind': 'epa_integrator_msp', 'name': 'Cybersecurity (Integrator) Managed Service Provider Contract Checklist', 'items': integrator},
        ],
    }


def cpg_components(sheets):
    rows = sheets['Function-aligned CPG Components']
    header = rows[0]
    cols = {name: i for i, name in enumerate(header) if name}
    out = []
    for r in rows[1:]:
        if len(r) > 1 and re.match(r'^\d\.[A-Z]$', r[1]):
            get = lambda name: clean(r[cols[name]]) if cols[name] < len(r) else ''
            out.append({
                'id': r[1],
                'function': get('NIST CSF Function'),
                'securityPractice': get('Security Practice'),
                'outcome': get('Outcome'),
                'riskAddressed': get('TTP or Risk Addressed'),
                'scope': get('Scope'),
                'recommendedAction': get('Recommended Action'),
                'csfReference': get('NIST CSF Reference'),
                'externalReferences': get('Additional External References'),
                'cost': get('Cost'),
                'impact': get('Impact'),
                'complexity': get('Complexity'),
            })
    assert len(out) == 38, len(out)
    return {'source': 'CISA Cross-Sector Cybersecurity Performance Goals 1.0.1 consolidated component listing (2023-03-20), public domain', 'practices': out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    jobs = [
        (WCAT_FILE, 'wcat-3.1.json', wcat),
        (PROCUREMENT_FILE, 'epa-procurement-checklist.json', procurement),
        (CPG_FILE, 'cpg-1.0.1-components.json', cpg_components),
    ]
    for src, dst, fn in jobs:
        data = fn(read_workbook(os.path.join(a.src, src)))
        with open(os.path.join(a.out, dst), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        n = len(data.get('items') or data.get('practices') or [c for c in data['checklists'] for c in c['items']])
        print(f'{dst}: {n} rows')


if __name__ == '__main__':
    main()
