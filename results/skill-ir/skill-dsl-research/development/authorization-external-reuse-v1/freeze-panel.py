"""Freeze exact independent author returns and shared source bytes before analysis."""
import pathlib,json,hashlib,subprocess
R=pathlib.Path(__file__).resolve().parent
REPO=R.parents[4]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rel=lambda p:p.relative_to(REPO).as_posix()
cases=[];units=[]
for project,ops in [('linkding',['remove','asset']),('todo',['task','list'])]:
 for op in ops:
  for state in ['original','changed']:
   ident=f'{project}-{op}-{state}'
   dsl=R/'authors'/f'{project}-dsl'/f'{op}-{state}.json'
   md=R/'authors'/f'{project}-md'/f'{op}-{state}.md'
   manifest=R/'manifests'/project/f'{op}-{state}.json'
   data=json.loads(dsl.read_text()); neutral=json.loads(manifest.read_text())
   sources=[]
   for name in data['sources']:
    p=dsl.parent/data['sourceRoot']/name
    q=manifest.parent/neutral['sourceRoot']/name
    assert p.read_bytes()==q.read_bytes(),name
    sources.extend([{'path':rel(p),'sha256':sha(p)},{'path':rel(q),'sha256':sha(q)}])
   cases.append({'id':ident,'project':project,'operation':op,'state':state,'taskId':data['taskId'],
     'dsl':rel(dsl),'dslSha256':sha(dsl),'markdown':rel(md),'markdownSha256':sha(md),'manifest':rel(manifest),'manifestSha256':sha(manifest),'sources':sources})
   arms=['markdown','dsl'] if len(cases)%2 else ['dsl','markdown']
   units.extend({'id':ident+'-'+arm,'caseId':ident,'arm':arm} for arm in arms)
config={'schemaVersion':'authorization-ab-panel/v1','implementationBase':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),
 'implementationRevision':'claim captures committed HEAD before first dispatch','exposure':'external-development','model':'xty/gpt-5.6-sol','temperature':0,'autoProbe':False,
 'executionOptions':{'timeoutMs':180000,'unitTimeoutMs':600000,'maxTokens':6000,'maxProviderDispatches':4,'maxDomainRepairs':1},
 'cases':cases,'units':units,'evaluatorSha256':sha(R/'evaluator'/'rubrics-v3.json'),
 'limits':{'initialUnits':16,'maximumSharedRevisionUnits':4,'automaticUnknownResend':False},
 'authorProtocol':{'initialAuthors':4,'freshRevisionAuthors':4,'diagnosticRoundsUsed':1,'mainSemanticCorrections':0,'firstStructurallyValid':{'dsl':0,'markdown':8},'firstSemanticallyReady':{'dsl':0,'markdown':0},'reason':'DSL unknown fields; MD author-phase directions; both revised by independent fresh relays',
 'helper':'Both DSL authors reported repeated common-field copying. Optional whole-field composer added after authoring; no claimed measured savings and no rewritten author inputs.'}}
(R/'panel-config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('frozen',len(cases),'states',len(units),'units')
