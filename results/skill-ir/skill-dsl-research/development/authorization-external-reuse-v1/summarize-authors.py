import json,pathlib,difflib
R=pathlib.Path(__file__).resolve().parent
def changes(a,b,p=''):
 if isinstance(a,dict) and isinstance(b,dict):
  return [q for k in sorted(set(a)|set(b)) for q in (changes(a[k],b[k],p+'/'+k) if k in a and k in b else [p+'/'+k])]
 return [] if a==b else [p]
groups=[];diffs=[]
(R/'changes').mkdir(exist_ok=True)
for project,ops in [('linkding',['remove','asset']),('todo',['task','list'])]:
 for arm in ['dsl','md']:
  name=f'{project}-{arm}';d=R/'authors'/name
  processes=[json.loads((R/'authors'/(name+s)/'process.json').read_text(encoding='utf-8')) for s in ['', '-r1']]
  usage={k:sum((p['usage'] or {}).get(k,0) for p in processes) for k in ['input_tokens','output_tokens','cached_input_tokens','reasoning_output_tokens','total_tokens']}
  groups.append({'authorGroup':name,'model':'gpt-5.6-luna','authors':2,'diagnosticRounds':1,'firstStructurallyRunnable':0 if arm=='dsl' else 4,'firstSemanticallyReady':0,'finalReady':4,'usage':usage,'actualUSD':None,'humanTime':None,'mainSemanticCorrections':0,'internalCodeHelp':False,'processFiles':[f'authors/{name+s}/process.json' for s in ['', '-r1']]})
  for op in ops:
   ext='json' if arm=='dsl' else 'md'
   a=(d/f'{op}-original.{ext}').read_text(encoding='utf-8');b=(d/f'{op}-changed.{ext}').read_text(encoding='utf-8')
   diff=''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile=f'{op}-original.{ext}',tofile=f'{op}-changed.{ext}'))
   out=f'changes/{project}-{op}-{arm}.diff';(R/out).write_text(diff,encoding='utf-8')
   diffs.append({'project':project,'operation':op,'arm':arm,'diff':out,'changedJsonPaths':changes(json.loads(a),json.loads(b)) if arm=='dsl' else None,'addedLines':sum(x.startswith('+') and not x.startswith('+++') for x in diff.splitlines()),'removedLines':sum(x.startswith('-') and not x.startswith('---') for x in diff.splitlines())})
summary={'schemaVersion':'authorization-ab-authors/v1','groups':groups,'changes':diffs,'costInterpretation':'Local author-agent token telemetry includes system/tool context. Cached input is a subset, not added again. Independent from paid analysis provider accounting. Human author duration/USD unknown. Revisions are fresh context relays, not continuation. Optional composer added after authoring; no measured saving claimed.'}
(R/'author-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'groups':len(groups),'initialAuthors':4,'revisionAuthors':4,'finalReady':16}))
