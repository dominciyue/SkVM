"""Run byte-identical fixed access functions with parameter-sensitive fake storage.

No handler, transport, real store, service or database is executed. The type
shim is inherited from BT; only two upstream files contribute original logic.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent

def project_world(inputs):
    """Field/identity projection only; never evaluates access policy.

    Upstream handler activation is outside the extracted scope. Unsupported
    upstream inputs are rejected instead of executing an unrelated local call.
    """
    def one(rows, **query):
        found=[row for row in rows if all(row.get(k)==v for k,v in query.items())]
        if len(found)>1:
            raise ValueError('ambiguous input identity')
        return found[0] if found else None
    errors=inputs['storeErrors']
    share=one(inputs['shares'],UID=inputs['request']['ShareToken'])
    if errors.get('share') or errors.get('memo') or not share or share['ExpiresTs'] is not None and inputs['now']>share['ExpiresTs']:
        raise ValueError('upstream shared-read activation outside observed scope')
    memo=one(inputs['memos'],ID=share['MemoID'])
    if not memo or memo['RowStatus']!='NORMAL' or memo['Visibility']=='SPACE':
        raise ValueError('upstream memo filter outside observed scope')
    viewer=one(inputs['users'],ID=inputs['contextUserID']) if inputs['contextUserID'] else None
    if inputs['contextUserID'] and (viewer is None or errors.get('viewer')):
        raise ValueError('upstream viewer resolution outside observed scope')
    if viewer and viewer['RowStatus']!='NORMAL':
        viewer=None
    if viewer is None and errors.get('instanceSetting'):
        raise ValueError('upstream instance setting outside observed scope')
    # Copy populations, preserving distinct query identities. Global historical
    # error facts are attached to the exact corresponding query row only.
    users=[dict(row) for row in inputs['users']]
    spaces=[dict(row) for row in inputs['spaces']]
    members=[dict(row) for row in inputs['memberships']]
    for rows,query,message in [(users,{'ID':memo['CreatorID']},errors.get('creator')),(spaces,{'ID':memo['SpaceID']},errors.get('space')),(members,{'SpaceID':memo['SpaceID'],'UserID':viewer['ID'] if viewer else None},errors.get('membership'))]:
        if message:
            row=one(rows,**query)
            if row is None:
                row=dict(query);rows.append(row)
            row['Error']=str(message)
    return {'Memo':memo,'Viewer':viewer,'SharedMemoID':share['MemoID'],'AllowAnonymous':viewer is None and inputs['instanceAccessMode']=='PUBLIC','Users':users,'Spaces':spaces,'Memberships':members}

def observe(source, target, go, world=None):
    for directory in [target / 'core/access', target / 'store']:
        directory.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name in ['memo.go', 'memo_resolve.go']:
        data = (source / 'core/access' / name).read_bytes()
        (target / 'core/access' / name).write_bytes(data)
        hashes['core/access/' + name] = hashlib.sha256(data).hexdigest()
    # Already disclosed BT shim, copied verbatim. No BT result is overwritten.
    shutil.copyfile(HERE / 'shim.go', target / 'store/shim.go')
    (target / 'go.mod').write_text('module github.com/usememos/memos\n\ngo 1.27.0\n', encoding='utf-8')
    for name in ['observer_test.go', 'parameter_sensitive_test.go']:
        shutil.copyfile(HERE / name, target / 'core/access' / name)
    env = {**os.environ, 'GOTOOLCHAIN':'local', 'GOPROXY':'off', 'GOSUMDB':'off', 'GOCACHE':str(ROOT / '.tmp/bt-source/gocache')}
    if world is not None:
        (target / 'world.json').write_text(json.dumps(world), encoding='utf-8')
        env['BU_OBSERVER_INPUT'] = str((target / 'world.json').resolve())
    result = subprocess.run([str(go), 'test', './core/access', '-run', 'TestBU', '-count=1', '-v'], cwd=target, env=env, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError((result.stdout + result.stderr)[-16000:])
    if world is None:
        return {'status':'tests-passed', 'output':result.stdout, 'sourceHashes':hashes}
    lines = [line.removeprefix('BU_OBSERVATION=') for line in result.stdout.splitlines() if line.startswith('BU_OBSERVATION=')]
    if len(lines) != 1:
        raise RuntimeError('missing or ambiguous original-function observation')
    return {**json.loads(lines[0]), 'sourceHashes':hashes, 'isolatedSourceExecutions':1, 'targetServiceExecutions':0, 'durableCommit':'unknown'}

if __name__ == '__main__':
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT / '.tmp/bt-source/memos-cb42e326ba9cc266a6a9570c53e0fe04c62793f4')
    parser.add_argument('--go', type=Path, default=ROOT / '.tmp/bt-source/toolchain/go/bin/go.exe')
    parser.add_argument('--input', type=Path)
    parser.add_argument('--stdin', action='store_true')
    args=parser.parse_args()
    # Each observation owns a separate directory; retained for diagnosis.
    base=ROOT / '.tmp/bu-source'; base.mkdir(parents=True,exist_ok=True)
    target=Path(tempfile.mkdtemp(prefix='observe-',dir=base))
    if args.stdin:
        request=json.load(sys.stdin)
        world=project_world(request['resourceInputs'])
        result=observe(Path(request['sourceRoot']),target,args.go,world)
        result['inputProjection']={'memoID':world['Memo']['ID'],'creatorID':world['Memo']['CreatorID'],'viewerID':world['Viewer']['ID'] if world['Viewer'] else None,'sharedMemoID':world['SharedMemoID']}
        print(json.dumps(result))
    else:
        print(json.dumps(observe(args.source,target,args.go,json.loads(args.input.read_text(encoding='utf-8')) if args.input else None)))
