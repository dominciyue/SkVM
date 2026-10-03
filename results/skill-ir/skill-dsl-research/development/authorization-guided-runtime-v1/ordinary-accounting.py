"""Archive completed ordinary runs and account observed calls without resending them."""
import gzip
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[4]
stages = []

def archive(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        if dst.suffix == '.gz':
            dst.write_bytes(gzip.compress(src.read_bytes(), mtime=0))
        else:
            shutil.copyfile(src, dst)

def usage(messages):
    return {key: sum((m.get('tokens') or m.get('usage') or {}).get(key, 0) for m in messages) for key in ['input', 'output', 'cacheRead', 'cacheWrite']}

for name in ['native-memos', 'native-memos-repaired', 'native-memos-policy-change', 'native-memos-policy-change-repaired', 'native-memos-policy-change-eof-repaired', 'native-memos-policy-change-compact-repaired', 'native-memos-worklist-repaired', 'native-memos-policy-change-worklist-repaired']:
    if not (root / 'ordinary' / name / 'native-trace.json').exists():
        continue
    report = json.loads((root / 'ordinary' / name / 'native-trace.json').read_text(encoding='utf8'))
    telemetry = report['telemetry']
    stages.append({'stage': name, 'kind': 'authorization-native', 'providerCalls': telemetry['providerCalls'], 'respondedCalls': telemetry['respondedCalls'], 'tokens': telemetry['knownTokens'], 'actualUSD': telemetry['totalActualUsd'], 'checkedDelivery': bool(report.get('result')), 'artifact': f'ordinary/{name}/native-trace.json'})

for directory in sorted((root / 'ordinary').glob('author-authorization-*')):
    result_file = directory / 'process-result.json'
    if not result_file.exists():
        continue
    original = json.loads(result_file.read_text(encoding='utf8'))
    correction_file = directory / 'accounting-correction-log-prefix-repaired.json'
    if not correction_file.exists():
        correction_file = directory / 'accounting-correction.json'
    accounting = json.loads(correction_file.read_text(encoding='utf8')) if correction_file.exists() else original
    stages.append({'stage': directory.name + '/source', 'kind': 'ordinary-authorization-author', 'providerCalls': accounting['providerCalls'], 'respondedCalls': accounting['respondedCalls'], 'tokens': accounting['knownTokens'], 'actualUSD': accounting['actualUSD'], 'artifact': str((correction_file if correction_file.exists() else result_file).relative_to(root)), 'originalFormatValid': original['validation']['status'] == 'valid', 'repairOf': original.get('repairOf'), 'originalCountPreserved': original['providerCalls'], 'accountingCorrection': correction_file.exists()})

for directory in sorted((root / 'ordinary').glob('consume-authorization-*')):
    result_file = directory / 'process-result.json'
    if not result_file.exists():
        continue
    result = json.loads(result_file.read_text(encoding='utf8'))
    claim_file = directory / 'claim.json'
    claim = json.loads(claim_file.read_text(encoding='utf8')) if claim_file.exists() else {}
    stages.append({'stage': directory.name, 'kind': 'ordinary-authored-inquiry-consumption', 'providerCalls': result['providerCalls'], 'respondedCalls': result['respondedCalls'], 'tokens': result['knownTokens'], 'actualUSD': result['actualUSD'], 'artifact': str(result_file.relative_to(root)), 'author': result['author'], 'status': result['status'], 'checkedDelivery': bool((result.get('validation') or {}).get('valid')), 'sourceConfigBytesUnchanged': result['sourceConfigBytesUnchanged'], 'repairOf': claim.get('repairOf'), 'repairId': claim.get('repairId'), 'resend': bool(claim.get('repairOf')), 'noAutomaticResend': result['noAutomaticResend']})

capture_root = repo / '.skvm/log/runtime/bare-agent/xty--gpt-5.6-sol'
for name, directory in [('author-workflows', 'natural-702d1a1a6869/20261003-213711-run-bar-e79f95b3'), ('author-workflows-repaired', 'natural-702d1a1a6869/20261003-220531-run-bar-0f87e0f2'), ('author-workflow-program', 'natural-ca095aca27e7/20261003-223255-run-bar-b6db8cd9')]:
    src = capture_root / directory
    messages = [json.loads(line) for line in (src / 'conversation.jsonl').read_text(encoding='utf8').splitlines()]
    requests = [m for m in messages if m.get('type') == 'request']
    responses = [m for m in messages if m.get('type') == 'response']
    target = root / 'ordinary' / name / 'source-capture'
    for f in src.rglob('*'):
        if f.is_file():
            relative = f.relative_to(src)
            archive(f, target / (str(relative) + '.gz' if f.name == 'conversation.jsonl' else relative))
    stages.append({'stage': name + '/source', 'kind': 'ordinary-source', 'providerCalls': len(requests), 'respondedCalls': len(responses), 'tokens': usage(responses), 'actualUSD': None, 'artifact': str(target.relative_to(root)), 'sourceRerun': name.endswith('repaired')})

proposal_root = repo / '.skvm/proposals/jit-optimize/bare-agent/xty--gpt-5.6-sol'
for name, directory in [('author-workflows', 'skill/20261003T134039384Z'), ('author-workflows-repaired', 'skill/20261003T140836671Z'), ('author-workflows-materialization-repaired', 'github-security-review/20261003T142528517Z'), ('author-workflow-program', 'skill/20261003T143856661Z')]:
    src = proposal_root / directory
    optimizer = src / 'round-1-optimizer'
    events = []
    for log in sorted(src.glob('round-1*optimizer/stdout.log')):
        for line in log.read_text(encoding='utf8').splitlines():
            try:
                value = json.loads(line)
                events.extend(value if isinstance(value, list) else [value])
            except json.JSONDecodeError:
                pass
    responses = [e['message'] for e in events if isinstance(e, dict) and e.get('type') == 'message_end' and e.get('message', {}).get('role') == 'assistant']
    calls = sum(isinstance(e, dict) and e.get('type') == 'turn_start' for e in events)
    target = root / 'ordinary' / name / 'proposal-capture'
    for f in src.rglob('*'):
        if f.is_file():
            relative = f.relative_to(src)
            archive(f, target / (str(relative) + '.gz' if f.name == 'stdout.log' else relative))
    stages.append({'stage': name + '/optimizer', 'kind': 'ordinary-optimizer', 'providerCalls': calls, 'respondedCalls': len(responses), 'tokens': usage(responses), 'actualUSD': None, 'reportedUnpricedCost': sum(m.get('usage', {}).get('cost', {}).get('total', 0) for m in responses), 'transportAttempts': 'unknown', 'artifact': str(target.relative_to(root)), 'outcome': 'program-generated-host-validation-rollback' if name == 'author-workflow-program' else 'documentation-only-no-new-program'})

for name, task in [('program-consume-original', 'natural-702d1a1a6869'), ('program-consume-changed', 'natural-1143b769fe39')]:
    src = repo / f'.skvm/log/20261003-230731-run/conv-001-{task}.jsonl'
    messages = [json.loads(line) for line in src.read_text(encoding='utf8').splitlines()]
    requests = [m for m in messages if m.get('type') == 'request']
    responses = [m for m in messages if m.get('type') == 'response']
    archive(src, root / 'ordinary' / name / 'conversation.jsonl.gz')
    stages.append({'stage': name, 'kind': 'ordinary-package-consumption', 'providerCalls': len(requests), 'respondedCalls': len(responses), 'tokens': usage(responses), 'actualUSD': None, 'artifact': f'ordinary/{name}', 'outcome': 'artifacts-and-final-delivered-cli-observation-missing', 'resend': False})

recovery = json.loads((root / 'ordinary/author-workflow-program-host-recovery/proposal.json').read_text(encoding='utf8'))
for f in Path(recovery['proposalDir']).rglob('*'):
    if f.is_file():
        archive(f, root / 'ordinary/author-workflow-program-host-recovery/proposal-capture' / f.relative_to(recovery['proposalDir']))

known_calls = sum(s['providerCalls'] for s in stages if s['providerCalls'] is not None)
unknown_call_stages = [s['stage'] for s in stages if s['providerCalls'] is None]
snapshot = {'at': datetime.now(timezone.utc).isoformat(), 'priorStructuredProviderCalls': 58, 'completedOrdinaryProviderCalls': known_calls, 'completedTotalProviderCalls': 58 + known_calls, 'providerCallsIsLowerBound': bool(unknown_call_stages), 'unknownCallStages': unknown_call_stages, 'stages': stages, 'actualUSD': None, 'targetExecutions': 0, 'excludedInFlight': [p.name for p in (root / 'ordinary').iterdir() if (p.name.startswith('native-') or p.name.startswith('author-authorization-') or p.name.startswith('consume-authorization-')) and (p / 'claim.json').exists() and not (p / 'process-result.json').exists()], 'localProgramExecution': 'New inventory command executed in source, validation and both natural package-consumption tasks; this is not authorization target execution.', 'hostRecoveryProviderCalls': 0, 'usageMeaning': 'Input excludes separately reported cacheRead. Sum both for full prompt. Zero unpriced optimizer cost is not known free usage. Prior structured usages and unknown Paperless call remain in original ledgers.'}
(root / 'ordinary-accounting.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({key: snapshot[key] for key in ['completedOrdinaryProviderCalls', 'completedTotalProviderCalls', 'actualUSD', 'excludedInFlight']}))
