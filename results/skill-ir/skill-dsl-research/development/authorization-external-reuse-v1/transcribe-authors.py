"""Copy exact agent-return payloads from this task's local transcripts; never synthesize author fields."""
import json,pathlib,sys,hashlib
R=pathlib.Path(__file__).resolve().parent
SESSION_ROOT=pathlib.Path(sys.argv[1])
PREFIX=sys.argv[2] if len(sys.argv)>2 else 'ab_'
PARENT='01a0c879-1e01-7242-80f5-2895aebb130f'
for p in SESSION_ROOT.glob('*.jsonl'):
 lines=p.read_text(encoding='utf-8').splitlines()
 if not lines: continue
 first=json.loads(lines[0]); meta=first.get('payload',{})
 agent=meta.get('agent_path','')
 if meta.get('parent_thread_id')!=PARENT or not agent.startswith('/root/'+PREFIX): continue
 final=None;usage=None;model=None;at=None
 for line in lines:
  o=json.loads(line);v=o.get('payload',{})
  if o.get('type')=='turn_context': model=v.get('model',model)
  if o.get('type')=='event_msg' and v.get('type')=='token_count': usage=(v.get('info') or {}).get('total_token_usage',usage)
  if o.get('type')=='response_item' and v.get('role')=='assistant' and v.get('type')=='message':
   text=''.join(c.get('text','') for c in v.get('content',[]) if c.get('type')=='output_text')
   candidate=text.strip()
   if '```json\n' in candidate: candidate=candidate.split('```json\n',1)[1].split('```',1)[0].strip()
   elif candidate.startswith('```'): candidate=candidate.split('\n',1)[1].rsplit('```',1)[0].strip()
   try: value=json.loads(candidate)
   except json.JSONDecodeError: continue
   if 'files' in value: final=(candidate,value);at=o.get('timestamp')
 if final is None: continue
 key=agent.split('/')[-1].removeprefix('ab_').replace('_','-')
 dest=R/'authors'/key
 dest.mkdir(parents=True,exist_ok=True)
 retained=dest/'return.json'
 if retained.exists() and retained.read_text(encoding='utf-8')!=final[0]+'\n': raise RuntimeError('refusing changed author return')
 retained.write_text(final[0]+'\n',encoding='utf-8')
 for name,content in final[1]['files'].items():
  if pathlib.Path(name).name!=name: raise RuntimeError('unsafe author filename')
  raw=content if isinstance(content,str) else json.dumps(content,ensure_ascii=False,indent=2)
  (dest/('draft-'+name)).write_text(raw+'\n',encoding='utf-8')
 process={'agent':agent,'sessionId':meta.get('id'),'startedAt':meta.get('timestamp'),'returnedAt':at,'model':model,'usage':usage,'actualUSD':None,'actualUSDStatus':'unknown','returnSha256':hashlib.sha256(final[0].encode()).hexdigest(),'transcription':'exact final payload copied from matching child transcript; JSON files pretty-printed only','mainSemanticCorrections':0,'selfReport':final[1].get('process')}
 (dest/'process.json').write_text(json.dumps(process,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(key,len(final[1]['files']),model,usage)
