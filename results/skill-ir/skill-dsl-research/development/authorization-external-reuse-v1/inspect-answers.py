import json,pathlib
R=pathlib.Path(__file__).resolve().parent
config=json.loads((R/'panel-config.json').read_text())
assert all((R/'runs'/u['id']/'unit.json').exists() for u in config['units'])
out=[]
for u in config['units']:
 d=R/'runs'/u['id'];meta=json.loads((d/'unit.json').read_text());run=json.loads((d/'sessions'/meta['report']['sessionId']/'run.json').read_text())
 out.append('\n## '+u['id']+' '+run['status'])
 kind=run.get('finalKind');a=run.get(kind,{}) if kind else {}
 wire=a.get('wireResult',{})
 for result in wire.get('results',[]):
  out.append(result['conclusion']+' | '+result['explanation'])
  for i,f in enumerate(result.get('facts',[])):out.append(f"fact[{i}] {f['kind']} {f['statement']} | "+json.dumps(f['citations']))
  out.append('Missing: '+json.dumps(result.get('decisiveMissingFacts',[])))
 if not wire:out.append(a.get('rawResponse','NO RESPONSE'))
(R/'answer-reading.txt').write_text('\n'.join(out)+'\n',encoding='utf-8')
print('saved answer-reading.txt')
