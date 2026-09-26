import json,pathlib,sys
R=pathlib.Path(__file__).resolve().parent
for p in pathlib.Path(sys.argv[1]).glob('*.jsonl'):
 lines=p.read_text(encoding='utf-8').splitlines()
 if not lines:continue
 meta=json.loads(lines[0]).get('payload',{});agent=meta.get('agent_path','')
 if meta.get('parent_thread_id')!='01a0c879-1e01-7242-80f5-2895aebb130f' or not agent.startswith('/root/ab_review_'):continue
 final='';usage=None
 for line in lines:
  o=json.loads(line);v=o.get('payload',{})
  if o.get('type')=='response_item' and v.get('role')=='assistant' and v.get('type')=='message':
   text=''.join(c.get('text','') for c in v.get('content',[]) if c.get('type')=='output_text')
   if text:final=text
  if o.get('type')=='event_msg' and v.get('type')=='token_count':usage=(v.get('info')or{}).get('total_token_usage',usage)
 name=agent.split('/')[-1]
 (R/(name+'.json')).write_text(json.dumps({'agent':agent,'return':final,'usage':usage,'actualUSD':None},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('retained independent reviews')
