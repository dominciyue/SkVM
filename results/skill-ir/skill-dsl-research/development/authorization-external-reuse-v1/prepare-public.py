"""Prepare identical source bytes and neutral briefs before independent authors/generation."""
import json, pathlib, shutil, hashlib
R=pathlib.Path(__file__).resolve().parent
REPO=R.parents[4]
def save(p,v):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
projects={
 'linkding':{'repo':'sissbruecker/linkding','license':'LICENSE.txt','files':['bookmarks/views/access.py','bookmarks/views/bookmarks.py','bookmarks/views/assets.py','bookmarks/services/assets.py','bookmarks/urls.py'],
 'operations':[
  {'id':'remove','entry':'shared_action','entryPath':'bookmarks/views/bookmarks.py','entryRange':[346,358], 'operation':'delete a selected bookmark through POST bookmarks/shared/action with only remove=<existing bookmark id>',
   'policy':'Only the bookmark owner may delete a bookmark. Sharing grants reading, not deletion.',
   'policyAuthority':'Bounded research task requirement accepted by task author; upstream action tests independently retained for evaluation.',
   'resource':'Existing bookmark, shared=True; owner has enable_sharing=True and enable_public_sharing=False.',
   'original':{'role':'authenticated ordinary user','facts':['Caller is not the bookmark owner','No superuser or special role','POST contains only remove=<bookmark id>'],'relation':'non-owner of a shared bookmark','expectation':'deny'},
   'changed':{'role':'authenticated ordinary user','facts':['Caller is the bookmark owner','No superuser or special role','POST contains only remove=<bookmark id>'],'relation':'owner of the same shared bookmark','expectation':'allow'}},
  {'id':'asset','entry':'view','entryPath':'bookmarks/views/assets.py','entryRange':[8,22], 'operation':'read an existing bookmark asset via GET assets/<asset_id>',
   'policy':'The owner may read an asset; authenticated readers may read it when its bookmark is shared and owner sharing is enabled; anonymous readers require public sharing enabled.',
   'policyAuthority':'Bounded research task requirement accepted by task author; upstream asset access tests retained independently for evaluation.',
   'resource':'Existing asset of another user\'s bookmark; bookmark.shared=True, owner.profile.enable_sharing=True, enable_public_sharing=False. Asset file exists and is valid.',
   'original':{'role':'authenticated ordinary reader','facts':['Caller is not the bookmark owner','GET request'],'relation':'authenticated non-owner of a shared bookmark asset','expectation':'allow'},
   'changed':{'role':'anonymous reader','facts':['Caller is not authenticated or the bookmark owner','GET request'],'relation':'anonymous non-owner of the same shared bookmark asset','expectation':'deny'}}]},
 'todo':{'repo':'shacker/django-todo','license':'LICENSE','files':['todo/views/delete_task.py','todo/views/del_list.py','todo/views/__init__.py','todo/utils.py','todo/defaults.py','todo/models.py','todo/urls.py'],
 'operations':[
  {'id':'task','entry':'delete_task','entryPath':'todo/views/delete_task.py','entryRange':[12,42], 'operation':'delete an existing task via POST delete/<task_id>',
   'policy':'With TODO_STAFF_ONLY explicitly False, authenticated creators, superusers, assignees or members of the task list group may delete the task; unrelated ordinary users may not.',
   'policyAuthority':'Explicit bounded research requirement, not a claim that implementation establishes its own normative correctness.',
   'resource':'Existing task in an existing task list and group. TODO_STAFF_ONLY is explicitly False in project settings.',
   'original':{'role':'authenticated non-staff ordinary user','facts':['Not superuser','Not task creator','Not assigned to task','Not member of task list group','POST request'],'relation':'unrelated to task and group','expectation':'deny'},
   'changed':{'role':'authenticated non-staff ordinary user','facts':['Not superuser','Not task creator','Assigned to task','Not member of task list group','POST request'],'relation':'task assignee outside list group','expectation':'allow'}},
  {'id':'list','entry':'del_list','entryPath':'todo/views/del_list.py','entryRange':[11,41], 'operation':'delete an existing list via POST <list_id>/<list_slug>/delete/',
   'policy':'List deletion requires both membership in the list group and staff status. TODO_STAFF_ONLY is explicitly False; this disables only the global staff-only restriction.',
   'policyAuthority':'Task-author accepted list requirement, grounded in upstream README permission description (lines 34-40 and 137-139).',
   'resource':'Existing list in a group the caller belongs to; valid matching list id and slug. TODO_STAFF_ONLY explicitly False.',
   'original':{'role':'authenticated non-staff group member','facts':['Not superuser','Member of the list group','is_staff=False','POST request'],'relation':'group member without staff role','expectation':'deny'},
   'changed':{'role':'authenticated staff group member','facts':['Not superuser','Member of the same list group','is_staff=True','POST request'],'relation':'same group member with staff role','expectation':'allow'}}]}
}
common={
 'questions':['Determine whether the provided source enforces the supplied policy expectation for this state, separately state the actual allow/deny/unknown decision.', 'Trace route/entry, identity and resource binding, strongest visible control, and protected effect. Explain why the stated role and relation change matters.', 'Distinguish task assumptions from facts observed in source. Name any decisive missing external facts; do not invent deployment facts. Exact HTTP status is optional unless needed to explain the decision.'],
 'scope':'Single fixed repository/ref and explicit source files only. No target execution, dependency installation, deployment access, patching or repository-wide discovery. Standard Django decorator/ORM behavior is assumed; requests reach the supplied view with the stated identity/settings, pass CSRF and unrelated infrastructure checks. Assess authorization reachability of the protected operation, not successful storage or deployment execution.',
 'sourceGaps':['Django framework/authentication backend and application deployment middleware are not supplied; identity, stated settings and ordinary ORM behavior are task assumptions.','Unrelated imported view/services and rendering behavior are not analyzed. All selected project-owned authorization gates and protected operation calls are supplied.'],
 'outputContract':'Both arms use the same compact plain/v4 JSON result protocol supplied by the host, with source IDs and numbered files. Do not write an answer now: author task instructions, not conclusions.',
 'authorRequirements':'Return four standalone task files: remove/asset or task/list, each original and changed. Preserve all public facts/questions. No counterpart materials, historical assessments, evaluator, test results or internal schemas may be read. Use only assigned public directory plus the designated guide. Return content read-only; main agent will save exact drafts. No file writes or analysis model calls.',
 'locate':'Optional common tool: bun ./src/index.ts authorization locate --root=<assigned project directory> --file=<explicit relative source> --match=<literal>. It reads only that file, and line numbers match supplied complete upstream files.',
 'authorCost':'Record tools used, unclear inputs, fields/paragraphs changed and repeated work. Time/tokens/USD unknown unless directly measured. Authors are models, not human subjects.'}
inventory=[]
for name,p in projects.items():
    sha=json.loads((R/'acquisition'/name/'commit.json').read_text())['sha']
    sources=[]
    for f in p['files']:
        src=R/'acquisition'/name/'raw'/f
        data=src.read_bytes(); sources.append({'path':f,'sha256':hashlib.sha256(data).hexdigest(),'characters':len(data.decode('utf-8')),'lines':len(data.decode('utf-8').splitlines()),'originalLocation':f'https://github.com/{p["repo"]}/blob/{sha}/{f}','mapping':'complete file, local lines equal upstream lines'})
    assert len(sources)<=12 and sum(s['characters'] for s in sources)<=40000
    brief={'project':name,'repository':'https://github.com/'+p['repo'],'sourceRef':sha,'exposure':'external-development','sourceRoot':'project','sources':p['files'],'common':common,'operations':p['operations']}
    save(R/'public'/name/'brief.json',brief)
    for f in p['files']:
        dest=R/'public'/name/'project'/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(R/'acquisition'/name/'raw'/f,dest)
    shutil.copyfile(R/'acquisition'/name/'raw'/p['license'],R/'public'/name/p['license'])
    save(R/'public'/name/'source-manifest.json',sources)
    for arm in ['dsl','markdown']:
        dest=R/'authors'/f'{name}-{arm}'
        dest.mkdir(parents=True,exist_ok=True)
        shutil.copytree(R/'public'/name/'project',dest/'project',dirs_exist_ok=True)
    inventory.append({'project':name,'repository':p['repo'],'ref':sha,'qualified':True,'sourceCharacters':sum(s['characters'] for s in sources),'files':len(sources),'states':4,'sourceExposure':'external-development, read during AB preparation before authoring and generation','coreRevisionAtSourceRead':'0bd831e5','noTargetExecution':True})
save(R/'qualification.json',{'selected':inventory,'taskStates':8,'analysisUnitsPlanned':16,'strictUnseenClaim':False,'candidateRejections':[]})
save(R/'field-reuse.json',{'method':['authoring/v2 vocabulary and lowering','plain/v4 host, citations, repair, telemetry','same reusable skill package','shared locate'],'project':['policy authority and accepted requirement','fixed source bytes and source locations','operation names and target resources'],'perState':['principal role/facts','resource relation','policy expectation for that state'],'compositionHelperRule':'AB4 records only: after AB6, require two independent DSL authors to show the same mechanical repetition before adding deterministic whole-object replacement. No deep merge, inference or template engine.','baselineSkillFailure':'AA Gitea first draft used upstream rather than supplied line numbers; retained evidence at authorization-authoring-reuse-v1/author-steps.json. This observed failure informs locate/skill; AB6 independently validates new use.'})
print(json.dumps(inventory,indent=2))
