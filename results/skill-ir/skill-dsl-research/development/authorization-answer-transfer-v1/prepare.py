"""One-time source-derived registration. Evaluation objects never enter model inputs."""
import copy, hashlib, json, pathlib, subprocess

BASE = pathlib.Path(__file__).resolve().parent
REPO = BASE.parents[4]
MODEL = BASE.parent / 'authorization-domain-execution-v1/model'
BQ = BASE.parent / 'authorization-source-program-consistency-v1'
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def save(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p): return p.relative_to(REPO).as_posix()

if (BASE / 'registration.json').exists(): raise SystemExit('Already registered; do not regenerate after dispatch')
if (BASE / 'attempts.json').exists() and read(BASE / 'attempts.json'): raise SystemExit('Already dispatched')
original = read(MODEL / 'inputs/memos-share.json')
brief = original['brief']
source_root = MODEL / 'public-source/memos'
facts = {
  'request': {'ShareToken': 'share-alpha'}, 'now': 2000, 'contextUserID': 0,
  'instanceAccessMode': 'PRIVATE',
  'shares': [{'ID': 71, 'UID': 'share-alpha', 'MemoID': 43, 'CreatorID': 17, 'ExpiresTs': 2000}, {'ID': 72, 'UID': 'share-other', 'MemoID': 89, 'CreatorID': 22, 'ExpiresTs': None}],
  'memos': [{'ID': 43, 'UID': 'memo-alpha', 'CreatorID': 17, 'RowStatus': 'NORMAL', 'Visibility': 'PRIVATE', 'SpaceID': None, 'ParentUID': 'parent-private', 'Content': 'shared body'}, {'ID': 89, 'UID': 'memo-other', 'CreatorID': 22, 'RowStatus': 'NORMAL', 'Visibility': 'PRIVATE', 'SpaceID': None, 'ParentUID': None, 'Content': 'unrelated body'}],
  'users': [{'ID': 17, 'Username': 'author-a', 'RowStatus': 'NORMAL', 'Role': 'USER'}, {'ID': 22, 'Username': 'author-b', 'RowStatus': 'NORMAL', 'Role': 'USER'}],
  'spaces': [], 'memberships': [], 'reactions': [], 'attachments': [],
  'storeErrors': {k: None for k in ['share', 'memo', 'viewer', 'instanceSetting', 'creator', 'space', 'membership', 'reactions', 'attachments', 'conversion']},
}
q = 'shared-memo-access'
inp = {k:v for k,v in original.items() if k not in ['brief','mode']}
inp['sourceRoot'] = '../../authorization-domain-execution-v1/model/public-source/memos'
inp['inquiry'] = {'schemaVersion':'authorization-inquiry/v2','mode':'behavior','operations':[{'id':'shared-memo','request':brief,'entryHint':'server/api/v1/memo_share_service.go::GetSharedMemo'}], 'questions':[{'id':q,'request':brief,'principal':'caller supplying a share token','resource':'memo and surrounding resources','operation':'read shared memo','entryHint':'GetSharedMemo and relevant allowed dependencies','premises':[],'operationId':'shared-memo','intent':'behavior'}]}
inp['resourceInputs'] = {q:facts}
inp['sourceNotes'] = {'format':'markdown','text': 'This is a researcher-authored source-analysis and shared-link troubleshooting task, not a customer incident or live service run. Answer the complete original question for the supplied finite scenario and explain relevant alternate branches. In edit mode also deliver a reusable source program, starting from an empty draft. In consume mode keep the supplied program unchanged. Facts are synthetic request, clock, database rows and operation error observations. Collections are complete finite populations; field names follow Go store structs, membership rows have SpaceID/UserID/Role. storeErrors null means the named storage operation returns normally, not an access grant; absent facts are unknown. No external allowed/access decision is supplied. Read source-visible helper logic or retain it as a named unresolved responsibility. Broader security-skill duties and unavailable deployment facts remain explicit.'}
changed = copy.deepcopy(inp); changed['resourceInputs'][q]['now'] = 2001
save(BASE/'inputs/memos-original.json', inp); save(BASE/'inputs/memos-changed.json', changed)
download = read(BQ/'inputs/consume.json')
save(BASE/'inputs/download.json', download)

cases=[]
def case(name, change, expected, basis, group='branches'):
    v=copy.deepcopy(inp); change(v['resourceInputs'][q]); cases.append({'name':name,'group':group,'input':v,'expected':expected,'sourceBasis':basis})
allowed={'disposition':'return','memoID':43,'content':'shared body','parent':None,'relations':[], 'sourceAccessHelperRequired':True}
deny={'disposition':'NotFound','returned':False}
service='server/api/v1/memo_share_service.go'
case('expiry-equal-private-anonymous',lambda f:None,allowed,[service+':172-218','core/access/memo.go:92-122'], 'primary')
case('expiry-passed',lambda f:f.update(now=2001),deny,[service+':216-229'],'primary')
case('expiry-future',lambda f:f.update(now=1999),allowed,[service+':218'])
case('no-expiry',lambda f:f['shares'][0].update(ExpiresTs=None),allowed,[service+':218'])
case('invalid-token',lambda f:f['request'].update(ShareToken='missing'),deny,[service+':221-229'])
case('revoked-token',lambda f:f['shares'].pop(0),deny,[service+':221-229'])
case('token-rebound',lambda f:f['shares'][0].update(MemoID=89),{**allowed,'memoID':89,'content':'unrelated body'},[service+':173-178'])
case('memo-missing',lambda f:f['memos'].pop(0),deny,[service+':178-185'])
case('memo-archived',lambda f:f['memos'][0].update(RowStatus='ARCHIVED'),deny,[service+':182-185'])
case('memo-space-audience',lambda f:f['memos'][0].update(Visibility='SPACE'),deny,[service+':183'])
case('unknown-audience',lambda f:f['memos'][0].update(Visibility='OTHER'),deny,['core/access/memo.go:97-99'])
case('creator-missing',lambda f:f['users'].pop(0),deny,['core/access/memo_resolve.go:36-42','core/access/memo.go:94'])
case('creator-archived',lambda f:f['users'][0].update(RowStatus='ARCHIVED'),allowed,['core/access/memo_resolve.go:41-42'])
case('creator-invalid-state',lambda f:f['users'][0].update(RowStatus='INVALID'),deny,['core/access/memo_resolve.go:41-42','core/access/memo.go:94'])
case('dangling-nonspace-placement',lambda f:f['memos'][0].update(SpaceID=909),allowed,['core/access/memo.go:100-102','server/api/v1/memo_service_converter.go:105-117'])
case('share-store-error',lambda f:f['storeErrors'].update(share='database-error'),{'disposition':'Internal','returned':False},[service+':223-225'])
case('context-policy-error',lambda f:f['storeErrors'].update(instanceSetting='database-error'),deny,['server/api/v1/memo_access.go:23-27',service+':186-189'])
case('missing-clock',lambda f:f.pop('now'),{'disposition':'unknown','blocked':'expiry'},[service+':218'],'unknown')
case('missing-users-population',lambda f:f.pop('users'),{'disposition':'unknown','blocked':'creator lookup'},['core/access/memo_resolve.go:36-42'],'unknown')
def rename(f):
    f['shares'][0].update(MemoID=143,CreatorID=117,UID='new-key'); f['request']['ShareToken']='new-key'; f['memos'][0].update(ID=143,CreatorID=117); f['users'][0]['ID']=117
case('renamed-identities',rename,{**allowed,'memoID':143},[service+':173-178'],'perturbation')
case('reordered-populations',lambda f:[f[k].reverse() for k in ['shares','memos','users']],allowed,[service+':173-178'],'perturbation')
case('unrelated-fields',lambda f:f['memos'][1].update(Extra='not relevant'),allowed,[service+':173-178'],'perturbation')
save(BASE/'evaluation/cases.json',cases)
save(BASE/'evaluation/rubric.json',{
 'fixedBeforeModel':True,'originalQuestion':brief,'planDenominator':9,'caseDenominator':len(cases),
 'necessaryFacts':[
 {'id':'binding','source':service+':173-185,221-229','requirements':'UID token lookup, share MemoID lookup; missing/revoked/expired NotFound, store error Internal; no caller-supplied memo selector'},
 {'id':'time','source':service+':216-218','requirements':'nil expiry unbounded; strictly greater Unix seconds expires, equality valid'},
 {'id':'access','source':'server/api/v1/memo_access.go:17-40;core/access/memo_resolve.go:31-90;core/access/memo.go:92-122','requirements':'source-visible creator validity, recognized visibility, actual read-context resolution/errors; share binds exactly one non-SPACE memo; archived memo denied earlier; private instance does not by itself block valid share'},
 {'id':'anonymous','source':'server/api/v1/acl_config.go:45-46,78-79;auth_service_session.go:269-290','requirements':'public/bootstrap route, user absent permitted but resolution may error; do not equate token with general user/owner permission'},
 {'id':'return','source':service+':191-213;memo_service_converter.go:26-137','requirements':'content/reactions/attachment metadata, nil relations, Parent cleared; placement projection restricted; creator missing and conversion errors retained; not graph or write authority'},
 {'id':'limits','source':'complete original brief and skill','requirements':'synthetic development data, no live API, source/helper uncertainty precise; wider skill duties scoped and not claimed audited'}],
 'scores':['full','partial','incorrect','unavailable'],'axes':['transport','raw-validity','source-semantic-coverage','field-values','event-order','source-decisions','original-task-completeness','adoption','cost'],
 'method':'Evaluate anonymous A/B/C answer copies against the same source rubric before attaching arm labels. Independent read-only verification may challenge main judgement. A sentence/field-name match is not quality proof.',
 'comparisons':'N to R includes author preparation and materials; R to E same raw execution increment. Same source tree/input/model/effort/budget required. First and confirmation separate.',
 'forbiddenModelInputs':['evaluation','expected','taskbook','old answers','developer semantic program']})
skills={n:read(MODEL/f'source-skills/{n}/source.json') for n in ['github-security-review','cloudflare-security-audit']}
save(BASE/'provenance.json',{'skills':skills,'source':{'repository':original['repository'],'ref':original['sourceRef'],'root':rel(source_root),'exposedDevelopment':True,'newHeldOut':False},'task':{'origin':'researcher-authored existing brief retained verbatim','originalInput':rel(MODEL/'inputs/memos-share.json'),'originalBrief':brief},'input':{'origin':'developer-designed finite synthetic request/rows/clock/error observations','liveService':False,'accessDecisionSupplied':False},'oracle':{'origin':'main agent source reading before author output','location':'evaluation/cases.json and rubric.json','notSentToModel':True},'developerChanges':['shared projection label','runner','task mapping and synthetic fixtures'], 'modelChanges':'pending; automatic raw must remain unedited'})
save(BASE/'evaluation/expressibility.json',{'sourceFirst':True,'supported':'Existing select/filter, field/default, integer comparison, choose, any/all, guard, record, when and unknown can describe token selection, expiry and finite creator checks. Source roles and exact predicates remain model responsibility. No semantic draft supplied.', 'gaps':'Full Go execution, transport/auth, database concurrency, conversion/Markdown processing and actual attachment delivery are not executed. Optional nested projections/collections may remain partial; do not change the original task.', 'sourceMutation':{'path':service,'old':'time.Now().Unix() > *ms.ExpiresTs','new':'time.Now().Unix() >= *ms.ExpiresTs','expected':'old dependent conclusion withdrawn, equality boundary differs'}})
save(BASE/'manifest.json',{'identity':'authorization-answer-transfer-v1','baseline':'4216358ff34191303a22cf8119378aa1b0ed94f9','order':['D-R','D-E','A-M','M0-N','M0-R','M0-E','M1-E','M1-R','M1-N'],'maxConfirmations':4,'developer':'gpt-6-astra/high','experiment':{'provider':'codex-account','model':'gpt-5.6-sol','effort':'high'},'finiteQueueComplete':False,'researchGoalAchieved':False})
save(BASE/'attempts.json',[]);save(BASE/'repairs.json',[])
save(BASE/'status.json',{'status':'in-progress','stage':'BR5-BR8','completed':['BR0','BR1','BR2','BR3'],'partial':['BR4'],'modelCalls':0,'actualPassed':{'outcomeTests':42},'targetsNotResults':['nine purposes','cross-task program','complete source answers']})
files=list((BASE/'inputs').glob('*.json'))+list((BASE/'evaluation').glob('*.json'))+[BASE/'provenance.json',BASE/'manifest.json', BQ/'authoring/automatic-program.json']
files += [p for n in skills for p in (MODEL/f'source-skills/{n}').rglob('*') if p.is_file()]
# Bind every available source file; no network or target app execution.
files += [p for p in source_root.rglob('*') if p.is_file()]
save(BASE/'registration.json',{'identity':'authorization-answer-transfer-v1','beforeFirstCall':True,'files':{rel(p):digest(p) for p in files}})
print(json.dumps({'cases':len(cases),'registeredFiles':len(files),'providerCalls':0}))
