import json,pathlib,shutil,hashlib
R=pathlib.Path(__file__).resolve().parent
def save(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
facts={
 'linkding-remove': [('bookmarks/views/bookmarks.py',346,378,'login_required shared_action rejects bulk but forwards single remove via handle_action; remove selects bookmark_write then delete'),('bookmarks/views/access.py',28,32,'bookmark_write queries both pk and owner=request.user, denying non-owner even if bookmark is shared')],
 'linkding-asset': [('bookmarks/views/assets.py',8,22,'view calls asset_read before stream_asset_file and response'),('bookmarks/views/access.py',7,25,'GET read permits owner, authenticated sharing or public sharing; anonymous nonowner with public sharing false is denied'),('bookmarks/views/access.py',46,53,'asset is bound by ID then linked bookmark_id is checked')],
 'todo-task': [('todo/views/delete_task.py',12,42,'authenticated/staff_check gate followed by POST; task selected by ID and deletion permitted for creator OR superuser OR assignee OR group member'),('todo/utils.py',17,27,'explicit TODO_STAFF_ONLY False permits authenticated nonstaff through staff_check'),('todo/defaults.py',20,28,'explicit settings override default')],
 'todo-list': [('todo/views/del_list.py',11,41,'authenticated/staff_check followed by group membership and staff required conjunctively before POST deletion'),('todo/utils.py',17,27,'global staff_check can be disabled but does not remove inner staff check'),('todo/defaults.py',20,28,'explicit False overrides True default')],
}
rubrics=[]; manifests=[]
for project in ['linkding','todo']:
 b=json.loads((R/'public'/project/'brief.json').read_text(encoding='utf-8'))
 for op in b['operations']:
  key=f'{project}-{op["id"]}'
  locs=[{'path':p,'startLine':s,'endLine':e} for p,s,e,_ in facts[key]]
  causal='; '.join(x[3] for x in facts[key])
  for state in ['original','changed']:
   sid=f'ab-{key}-{state}';s=op[state]
   manifest={'schemaVersion':'authorization-assessment-authoring/v2','taskId':sid,'request':f'Assess {op["operation"]} for the supplied {state} scenario.','repository':b['repository'],'sourceRef':b['sourceRef'],'sourceRoot':'project','sources':b['sources'],
    'policies':{'policy':{'text':op['policy'],'location':'brief.json#/operations/'+op['id'],'revision':'ab-brief-v1','acceptance':'accepted','reason':op['policyAuthority']}},
    'principals':{'caller':{'role':s['role'],'facts':s['facts']}},'resources':{'target':{'type':op['id'],'facts':[op['resource']]}},
    'entries':{'target':{'name':op['entry'],'locations':[{'path':op['entryPath'],'startLine':op['entryRange'][0],'endLine':op['entryRange'][1]}]}},
    'scenarios':{'assessment':{'principal':'caller','resource':'target','policy':'policy','entries':['target'],'relation':s['relation'],'operation':op['operation'],'expectation':s['expectation']}},
    'additionalQuestions':b['common']['questions'],'additionalConstraints':[b['common']['scope'],*b['common']['sourceGaps']]}
   save(R/'manifests'/project/f'{op["id"]}-{state}.json',manifest)
   criteria=[]
   for cid,layer,req,rule in [
    ('decision-control','necessary-semantics','State the allow/deny decision and decisive authorization gate for the stated caller.',f'Actual disposition is {s["expectation"]}. {causal}'),
    ('binding-effect','necessary-semantics','Explain identity/resource binding and whether the protected effect is reached.',causal),
    ('scenario-explanation','explanation-completeness','Explain which supplied role/relation facts settle this state; distinguish changed facts from fixed context.',f'Stated scenario: {s}. {causal}'),
    ('bounded-evidence','explanation-completeness','Keep task assumptions distinct from source/deployment facts and do not invent decisive unknowns.', 'Standard Django behavior and stated identity/settings are assumptions; no deployed execution verified. Missing unrelated dependencies do not force unknown on this bounded authorization reachability question.'),
    ('http-detail','optional-detail','Optional precise denial/response detail.', 'Exact HTTP detail is not required by the public task; do not conflate a source quote containing status text with answer explanation.')]:
    criteria.append({'id':cid,'layer':layer,'requirement':req,'decisionRelevance':'Required for the publicly requested causal authorization assessment.' if layer!='optional-detail' else 'Optional diagnostic detail only.','oracleRule':rule,'sourceLocations':locs})
   rubrics.append({'caseId':sid,'taskId':sid,'rubricVersion':'ab-rubric-v3','obligationId':'scenario%3Aassessment::entry%3Atarget','expectedDisposition':'source_refuted','dispositionRule':{'oracleRule':f'Policy enforced; actual {s["expectation"]}. {causal}','sourceLocations':locs},'scopeRule':{'oracleRule':'Only supplied source and declared state; no deployment or repository completeness claim.','sourceLocations':locs},'criteria':criteria,'responseDetails':{'criterionIds':['http-detail'],'requiredCriterionIds':[],'basis':'Public brief does not demand exact HTTP status.'}})
   manifests.append({'taskId':sid,'project':project,'operation':op['id'],'state':state,'path':f'manifests/{project}/{op["id"]}-{state}.json','origin':'mechanically transcribed neutral brief before independent authors','uses':'Host compile/normalization identity, closed obligation IDs, source binding, common label/output checks and evaluation binding only. Its canonical declaration is not rendered to Markdown.'})
 for f in b['sources']:
  p=R/'manifests'/project/'project'/f;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(R/'public'/project/'project'/f,p)
 for f in (["bookmarks/tests/test_bookmark_asset_view.py","bookmarks/tests/test_bookmark_action_view.py"] if project=='linkding' else ['todo/tests/test_views.py','README.md']):
  p=R/'evaluator'/'upstream'/project/f;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(R/'acquisition'/project/'raw'/f,p)
save(R/'evaluator'/'rubrics-v3.json',{'schemaVersion':'authorization-ab-rubrics/v1','preparedBeforeAuthorsAndAnalysis':True,'cases':rubrics,'caveat':'Development preparation includes source reading and author-defined normative requirements. No production vulnerability claim or strict unseen status.'})
save(R/'manifest-provenance.json',{'schemaVersion':'authorization-ab-manifest-provenance/v1','preparedBeforeAuthors':True,'sharedHostFields':['task/repository/ref','closed obligation IDs','source catalog','canonical output metadata','policy/state evaluation binding'],'modelVisibleFromManifest':['closed obligation ID','common output label definitions'], 'notRenderedToMarkdown':['policy text','principal/resource/entry/scenario metadata','analysis profile questions','DSL instructions'], 'comparison':'same-helper authoring/execution flow, not raw native security skill or pure syntax causality','manifests':manifests})
(R/'public'/'markdown-guide.md').write_text('''# Independent Markdown author guide
Write standalone natural-language authorization instructions directly from the assigned common brief and source files. Do not fill or render a DSL. Each file must state repository/ref, task ID, policy authority/text, caller and resource facts, operation/entry scope, original or changed state, and all public analysis questions/constraints. Preserve normative expectation without asserting a source conclusion. Source analysis is the downstream model\'s job. The host appends exactly the same numbered source catalog and compact plain/v4 output contract used for the DSL arm, including the required obligation ID scenario%3Aassessment::entry%3Atarget. You may mention it as a result label, but no JSON task structure is required. Use current supplied-file line numbers if citing entry locations. Use literal locate on explicit files or read the same source directly. Missing source/control facts must not be invented. No analysis answers or oracle checklist belong in the authored request. Return four Markdown strings and a process record; do not write files.
''',encoding='utf-8')
save(R/'author-dispatch.json',{'status':'ready','authorModel':'default agent configuration (gpt-5.6-luna/low)','fork':'none','tasks':['linkding-dsl','linkding-markdown','todo-dsl','todo-markdown'],'policy':'read-only returns, no source modifications, main waits until all finish; at most two diagnostic relay rounds, never main-agent semantic fixes','authorCosts':{'tokens':None,'actualUSD':None,'status':'not exposed by subagent tool; tracked independently from analysis usage'},'mainFieldCorrections':0})
print('Prepared neutral manifests, rubric, four author packets; no model calls.')
