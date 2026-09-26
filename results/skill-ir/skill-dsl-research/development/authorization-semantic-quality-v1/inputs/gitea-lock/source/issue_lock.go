// Fixed excerpt from go-gitea/gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b.
// Original path and range: routers/api/v1/repo/issue_lock.go:15-81.

// LockIssue lock an issue
func LockIssue(ctx *context.APIContext) {
	// swagger:operation PUT /repos/{owner}/{repo}/issues/{index}/lock issue issueLockIssue
	// ---
	// summary: Lock an issue
	// consumes:
	// - application/json
	// produces:
	// - application/json
	// parameters:
	// - name: owner
	//   in: path
	//   description: owner of the repo
	//   type: string
	//   required: true
	// - name: repo
	//   in: path
	//   description: name of the repo
	//   type: string
	//   required: true
	// - name: index
	//   in: path
	//   description: index of the issue
	//   type: integer
	//   format: int64
	//   required: true
	// - name: body
	//   in: body
	//   schema:
	//     "$ref": "#/definitions/LockIssueOption"
	// responses:
	//   "204":
	//     "$ref": "#/responses/empty"
	//   "403":
	//     "$ref": "#/responses/forbidden"
	//   "404":
	//     "$ref": "#/responses/notFound"

	reason := web.GetForm[*api.LockIssueOption](ctx).Reason
	issue, err := issues_model.GetIssueByIndex(ctx, ctx.Repo.Repository.ID, ctx.PathParamInt64("index"))
	if err != nil {
		ctx.APIErrorAuto(err)
		return
	}

	if !ctx.Repo.Permission.CanWriteIssuesOrPulls(issue.IsPull) {
		ctx.APIError(http.StatusForbidden, "no permission to lock this issue")
		return
	}

	if !issue.IsLocked {
		opt := &issues_model.IssueLockOptions{
			Doer:   ctx.ContextUser,
			Issue:  issue,
			Reason: reason,
		}

		issue.Repo = ctx.Repo.Repository
		err = issues_model.LockIssue(ctx, opt)
		if err != nil {
			ctx.APIErrorInternal(err)
			return
		}
	}

	ctx.Status(http.StatusNoContent)
}
