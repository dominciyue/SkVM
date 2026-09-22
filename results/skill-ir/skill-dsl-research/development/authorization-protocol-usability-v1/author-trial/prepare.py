"""Map the retained clean-context draft to the documented grammar; no prior assessment is read."""
import json, pathlib, shutil
root = pathlib.Path(__file__).resolve().parent
draft = json.loads((root/'draft.json').read_text(encoding='utf-8'))
policy = 'A caller may query collaborator permission when querying self, as a repository administrator, or as a site administrator; otherwise deny.'
task = {
    'schemaVersion': 'source-authorization-assessment/v0',
    'taskId': 'author-trial-collaborator',
    'request': draft['task']['naturalTask'],
    'repository': 'https://github.com/go-gitea/gitea',
    'sourceRef': 'fc28937a8d772fe9e4025c9b5f24d5db4d86610b',
    'sourceMode': 'fixed-context',
    'policySources': [{'id':'collaborator-policy','kind':'task-requirement','text':policy,'location':'source/policy.json:6','revision':'task-policy-v1','acceptance':{'status':'accepted','actorRole':'task-author','reason':'The user supplied this bounded normative policy.'}}],
    'principals':[{'id':'caller','role':'authenticated repository read collaborator','description':'Neither a repository administrator nor a site administrator; querying a different existing collaborator.','startingCapabilities':['authenticated','repository-read']}],
    'resources':[{'id':'permission','type':'collaborator repository permission','description':'Permission of a different existing collaborator in the selected repository.'}],
    'entries':[{'id':'permission-entry','name':'GetRepoPermissions','locations':[{'path':'collaborators.go','startLine':5,'endLine':58}]}],
    'obligations':[{'id':'permission-query','principalId':'caller','resourceId':'permission','relation':'different-collaborator','operation':'read collaborator permission','expectation':'deny','conditions':[{'name':'authenticated repository reader','basis':'Fixed by the natural task.'},{'name':'not administrator','basis':'The caller is neither repository admin nor site admin.'},{'name':'different existing collaborator','basis':'The requested username belongs to a different existing collaborator.'}],'policySourceId':'collaborator-policy','entryIds':['permission-entry']}],
    'scopeAssurance':'Only the supplied fixed GetRepoPermissions entry; source discovery and deployment are not assessed.',
    'requiredAnalysis':['Explain caller and target binding, the strongest authorization control, and whether the protected permission read is reachable.','State any decisive unavailable fact without inventing deployment behavior.'],
    'constraints':['Use only the supplied fixed source and the declared scenario.','Do not execute or modify the target.','The policy source normative rule is shared; its boundedScenario describes the original example, while this task declares the scenario being assessed.'],
}
authoring={'schemaVersion':'authorization-assessment-authoring/v1','sourceRoot':'source','sources':draft['sources'],'task':task}
for name in ['original','self-query']:
    out=root/name
    (out/'source').mkdir(parents=True,exist_ok=True)
    for source in draft['sources']:
        shutil.copyfile(root.parent/'public-inputs/collaborator/source'/source,out/'source'/source)
    if name=='self-query':
        task['taskId']='author-trial-collaborator-self'
        task['request']='Determine whether the same authenticated repository read collaborator, neither repository admin nor site admin, may query their own permission at the declared endpoint.'
        task['principals'][0]['description']='Neither a repository administrator nor a site administrator; querying their own existing collaborator username.'
        task['resources'][0]['description']='The caller own collaborator permission in the selected repository.'
        task['obligations'][0]['relation']='self-collaborator'
        task['obligations'][0]['expectation']='allow'
        task['obligations'][0]['conditions'][2]={'name':'self-query existing collaborator','basis':'The requested username equals the caller username under the source comparison.'}
    with (out/'authoring.json').open('x',encoding='utf-8') as f: f.write(json.dumps(authoring,indent=2)+'\n')
trace={'participant':'agent-assisted with main-agent schema correction','firstNormalization':'needs-input','diagnosticCount':len(json.loads((root/'first-normalization.json').read_text(encoding='utf-8'))['diagnostics']),'sharedImprovement':'usage exact field table and complete synthetic authoring example','schemaCorrection':'Mapped draft intent to task v0 fields; no historical assessment read for preparation. Removed draft answer-specific denial constraint and statusCode expectation; kept user policy and deny scenario.','variationFields':['taskId','request','principals[0].description','resources[0].description','obligations[0].relation','obligations[0].expectation','obligations[0].conditions[2]'],'policyAndSourceUnchanged':True,'humanMinutes':None,'secondIndependentTrial':False}
(root/'steps.json').write_text(json.dumps(trace,indent=2)+'\n',encoding='utf-8')
