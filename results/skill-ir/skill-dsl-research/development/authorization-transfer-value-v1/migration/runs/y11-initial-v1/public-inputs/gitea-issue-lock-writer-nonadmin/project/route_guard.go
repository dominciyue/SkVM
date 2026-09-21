// Fixed excerpts from go-gitea/gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b.
// Original path and ranges: routers/api/v1/api.go:451-459,1741-1745.

// reqAdmin user should be an owner or a collaborator with admin write of a repository, or site admin
func reqAdmin() func(ctx *context.APIContext) {
	return func(ctx *context.APIContext) {
		if !ctx.IsUserRepoAdmin() && !ctx.IsUserSiteAdmin() {
			ctx.APIError(http.StatusForbidden, "user should be an owner or a collaborator with admin write of a repository")
			return
		}
	}
}

// Upstream route tree outside the declared lock group is omitted.

m.Group("/lock", func() {
	m.Combo("").
		Put(bind(api.LockIssueOption{}), repo.LockIssue).
		Delete(repo.UnlockIssue)
}, reqToken(), reqAdmin())
