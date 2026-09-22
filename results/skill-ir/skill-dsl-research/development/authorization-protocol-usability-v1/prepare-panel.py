"""Freeze exposed public bytes and a separate evaluator before any Z generation."""
import hashlib, json, pathlib, shutil, subprocess

repo = pathlib.Path(__file__).resolve().parents[5]
root = pathlib.Path(__file__).resolve().parent
y = repo / 'results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1'
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open('x', encoding='utf-8', newline='\n') as f: f.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
cases = [
    ('header', y/'study/runs/y8-initial-v1/public-inputs/owui-trusted-header-deployment'),
    ('collaborator', y/'migration/public-inputs/gitea-collaborator-cross-user-permission'),
    ('assignee', y/'migration/public-inputs/gitea-issue-assignee-nonwriter'),
    ('lock', y/'migration/public-inputs/gitea-issue-lock-writer-nonadmin'),
]
frozen, units = [], []
for i, (name, original) in enumerate(cases):
    source_input = original/'assessment.json'
    data = read(source_input)
    destination = root/'public-inputs'/name
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_input, destination/'assessment.json')
    for source in data['sources']:
        target = destination/data['sourceRoot']/source
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original/data['sourceRoot']/source, target)
    input_path = (destination/'assessment.json').relative_to(repo).as_posix()
    frozen.append({'id': name, 'taskId': data['task']['taskId'], 'input': input_path, 'inputSha256': digest(destination/'assessment.json'), 'sources': [{'path': (destination/data['sourceRoot']/s).relative_to(repo).as_posix(), 'sha256': digest(destination/data['sourceRoot']/s)} for s in data['sources']]})
    for wire in (['legacy', 'v4'] if i % 2 == 0 else ['v4', 'legacy']):
        units.append({'id': f'{len(units)+1:02d}-{name}-{wire}', 'caseId': name, 'method': 'conditions', 'wire': wire})
old = read(repo/'results/skill-ir/skill-dsl-research/development/authorization-capability-v1/evaluation-v2.json')
header = next(c for c in old['cases'] if c['caseId'] == 'owui-trusted-header-deployment')
rubrics = [header] + read(y/'migration/evaluator/rubrics-v1.json')['cases']
for r in rubrics:
    r['rubricVersion'] += '-z-v3'
    if r['caseId'].endswith('writer-nonadmin'):
        control = next(c for c in r['criteria'] if c['id'] == 'lock-nonadmin-http-403')
        control['id'] = 'lock-nonadmin-denial-control'
        control['requirement'] = 'State that reqAdmin rejects before handler dispatch when both repository-admin and site-admin status are false.'
    response_ids = [c['id'] for c in r['criteria'] if '403' in c['id']]
    r['responseDetails'] = {'criterionIds': response_ids, 'requiredCriterionIds': [], 'basis': 'The unchanged public request asks authorization and effect reachability, not an exact HTTP response; response status does not change that property. Explicit status remains separately scored.'}
write(root/'evaluator/rubrics-v3.json', {'schemaVersion': 'authorization-protocol-evaluation-supplement/v3', 'historicalArtifactsModified': False, 'cases': rubrics, 'rules': ['Authorization decision/control, requested condition explanation, and response detail are distinct.', 'Unsupported deployment truth or reversed control is incorrect.', 'Citations do not substitute for answer-level claims.', 'No generation receives evaluator criteria.']})
config = {'schemaVersion': 'authorization-protocol-study/v1', 'implementationRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(), 'model': 'xty/gpt-5.6-sol', 'temperature': 0, 'autoProbe': False, 'executionOptions': {'timeoutMs': 180000, 'unitTimeoutMs': 600000, 'maxTokens': 6000, 'maxProviderDispatches': 4, 'maxDomainRepairs': 1}, 'cases': frozen, 'units': units, 'evaluatorSha256': digest(root/'evaluator/rubrics-v3.json'), 'revisionLimit': 4, 'ordinaryUseUnits': 2, 'actualUSD': None}
write(root/'panel-config.json', config)
print(json.dumps({'cases': len(frozen), 'units': len(units), 'configSha256': digest(root/'panel-config.json')}, indent=2))
