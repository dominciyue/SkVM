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

for name in ['native-memos', 'native-memos-repaired', 'native-memos-policy-change', 'native-memos-policy-change-repaired', 'native-memos-policy-change-eof-repaired', 'native-memos-policy-change-compact-repaired']:
    if not (root / 'ordinary' / name / 'native-trace.json').exists():
        continue
    report = json.loads((root / 'ordinary' / name / 'native-trace.json').read_text(encoding='utf8'))
    telemetry = report['telemetry']
    stages.append({'stage': name, 'kind': 'authorization-native', 'providerCalls': telemetry['providerCalls'], 'respondedCalls': telemetry['respondedCalls'], 'tokens': telemetry['knownTokens'], 'actualUSD': telemetry['totalActualUsd'], 'checkedDelivery': bool(report.get('result')), 'artifact': f'ordinary/{name}/native-trace.json'})

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

snapshot = {'at': datetime.now(timezone.utc).isoformat(), 'priorStructuredProviderCalls': 58, 'completedOrdinaryProviderCalls': sum(s['providerCalls'] for s in stages), 'completedTotalProviderCalls': 58 + sum(s['providerCalls'] for s in stages), 'stages': stages, 'actualUSD': None, 'targetExecutions': 0, 'excludedInFlight': [name for name in ['native-memos-policy-change-eof-repaired', 'native-memos-policy-change-compact-repaired'] if not (root / 'ordinary' / name / 'native-trace.json').exists()], 'localProgramExecution': 'New inventory command executed in source, validation and both natural package-consumption tasks; this is not authorization target execution.', 'hostRecoveryProviderCalls': 0, 'usageMeaning': 'Input excludes separately reported cacheRead. Sum both for full prompt. Zero unpriced optimizer cost is not known free usage. Prior structured usages and unknown Paperless call remain in original ledgers.'}
(root / 'ordinary-accounting.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({key: snapshot[key] for key in ['completedOrdinaryProviderCalls', 'completedTotalProviderCalls', 'actualUSD', 'excludedInFlight']}))
