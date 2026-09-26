## Gitea collaborator-permission assessment

Assess the authorization behavior for `GET /repos/{owner}/{repo}/collaborators/{collaborator}/permission` in `https://github.com/go-gitea/gitea` at ref `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`.

Use the accepted policy: a caller may query a collaborator’s repository permission when the caller is a site administrator, a repository administrator, or is querying their own username. Otherwise, the request must be rejected with HTTP 403 before the target collaborator is loaded.

Evaluate this state: the principal is an authenticated repository-read collaborator who is neither a site nor repository administrator; the resource is the caller’s own repository permission; the operation is querying that collaborator’s repository permission. The relevant entry point is `GetRepoPermissions` in `inputs/gitea-collaborator/source/collaborators.go`, source scope `collaborators.go:1-58`.

Ground the assessment in the cited source crop. Cite the repository, ref, source file and relevant line(s), including the collaborator path parameter and the case-insensitive self-username relation in the authorization guard. Do not execute the target endpoint, contact or run the project, infer deployment facts, or treat runtime behavior as observed. Report only what the source-visible authorization logic establishes.
