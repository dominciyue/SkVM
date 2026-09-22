"""Cache individual GitHub objects without executing target code."""
import json, pathlib, subprocess, sys, hashlib, datetime, base64
ROOT = pathlib.Path(__file__).resolve().parent
def get(endpoint, dest):
    p = ROOT / 'acquisition' / dest
    if p.exists():
        return json.loads(p.read_text(encoding='utf-8'))
    result = subprocess.run(['gh', 'api', endpoint], capture_output=True)
    event = {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'endpoint':endpoint, 'exitCode':result.returncode}
    if result.returncode:
        event['error'] = result.stderr.decode('utf-8', errors='replace')
    else:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(result.stdout)
        event['sha256'] = hashlib.sha256(result.stdout).hexdigest()
    with (ROOT / 'acquisition-journal.jsonl').open('a',encoding='utf-8') as f:
        f.write(json.dumps(event)+'\n')
    if result.returncode: raise RuntimeError(event['error'])
    return json.loads(result.stdout)
if __name__ == '__main__':
    if len(sys.argv) > 2:
        name, repo = sys.argv[1], {'linkding':'sissbruecker/linkding','todo':'shacker/django-todo'}[sys.argv[1]]
        sha = json.loads((ROOT/'acquisition'/name/'commit.json').read_text())['sha']
        for filename in sys.argv[2:]:
            obj = get(f'repos/{repo}/contents/{filename}?ref={sha}', f'{name}/objects/{filename}.json')
            p = ROOT/'acquisition'/name/'raw'/filename
            p.parent.mkdir(parents=True,exist_ok=True)
            content = base64.b64decode(obj['content'])
            p.write_bytes(content)
            print(name, filename, len(content))
        sys.exit(0)
    for name, repo in [('linkding','sissbruecker/linkding'),('todo','shacker/django-todo')]:
        commit = get(f'repos/{repo}/commits/master', f'{name}/commit.json')
        sha = commit['sha']
        tree = get(f'repos/{repo}/git/trees/{sha}?recursive=1', f'{name}/tree.json')
        print(name, sha)
        print('\n'.join(x['path'] for x in tree['tree'] if x['type']=='blob' and any(k in x['path'].lower() for k in ['permission','access','view','test','license'])))
