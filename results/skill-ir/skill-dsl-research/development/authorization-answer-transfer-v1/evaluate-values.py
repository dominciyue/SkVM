"""Evaluation-only arithmetic over retained actual events; never model input.

This reports selected scalar/disposition matches and genuine unknown conditions
separately from full payload and source/call-order review. It does not reconstruct
missing fields from expected values or certify an HTTP response.
"""
import json
from pathlib import Path

base = Path(__file__).resolve().parent
results = []
for file in sorted((base / 'evaluation').glob('*/matrix.json')):
    matrix = json.loads(file.read_text(encoding='utf-8'))
    if not matrix.get('rows') or 'expected' not in matrix['rows'][0]:
        continue
    rows = []
    for case in matrix['rows']:
        expected, actual = case['expected'], case.get('actual') or {}
        value = actual.get('returned')
        term = actual.get('termination', '')
        conditions = actual.get('conditions', [])
        event = (actual.get('events') or [{}])[-1]
        disposition = expected['disposition']
        known_match = None
        unknown_preserved = None
        if disposition == 'return':
            known_match = (term == 'return' and isinstance(value, dict)
                           and value.get('memo_id') == expected['memoID']
                           and value.get('content') == expected['content']
                           and 'parent' in value and value['parent'] == expected['parent']
                           and event.get('outputs', {}).get('known') is True
                           and not conditions)
        elif disposition in ('NotFound', 'Internal'):
            label = term.split(':', 1)[0].replace('_', '').lower()
            known_match = (label == disposition.lower() and value is None
                           and event.get('outcome') == 'rejected' and not conditions)
        else:
            # Evidence must name the missing input in an actual unresolved test,
            # not merely repeat an author's global coverage disclaimer.
            marker = 'now' if expected['blocked'] == 'expiry' else 'creator'
            unknown_preserved = any(marker in json.dumps(c.get('test', {})) for c in conditions)
        rows.append({
            'name': case['name'], 'expectedDisposition': disposition,
            'actualTermination': term, 'actualLastEvent': event.get('id'),
            'actualLastOutcome': event.get('outcome'),
            'selectedScalarAndDispositionMatch': known_match,
            'inputUnknownPreserved': unknown_preserved,
            'conditionSteps': [c.get('step') for c in conditions],
            'actualRelationsArrayPresent': isinstance(value, dict) and isinstance(value.get('relations'), list),
            'relationAbsenceSummary': (value.get('relation_graph_included') is False or value.get('relation_count') == 0) if isinstance(value, dict) else False,
        })
    results.append({
        'track': matrix['track'], 'programSha256': matrix['programSha256'],
        'sourceCheck': matrix['sourceCheck'], 'cases': len(rows),
        'knownCases': sum(r['expectedDisposition'] != 'unknown' for r in rows),
        'knownMatches': sum(r['selectedScalarAndDispositionMatch'] is True for r in rows),
        'unknownCases': sum(r['expectedDisposition'] == 'unknown' for r in rows),
        'unknownsPreserved': sum(r['inputUnknownPreserved'] is True for r in rows),
        'completeConvertedPayloadCertified': False,
        'sourceSemanticAndOrderReview': 'separate; these counts do not prove source semantics',
        'rows': rows,
    })
out = {'providerCalls': 0, 'mapping': {'memoID': 'returned.memo_id', 'content': 'returned.content', 'parent': 'returned.parent'},
       'scope': 'Reviewed finite summaries. Actual relation arrays and absence summaries remain distinct. Global coverage gaps never count as input unknowns.', 'results': results}
(base / 'evaluation/value-comparison.json').write_text(json.dumps(out, indent=2) + '\n', encoding='utf-8')
print(json.dumps([{k: r[k] for k in ('track', 'cases', 'knownMatches', 'knownCases', 'unknownsPreserved', 'unknownCases')} for r in results]))
