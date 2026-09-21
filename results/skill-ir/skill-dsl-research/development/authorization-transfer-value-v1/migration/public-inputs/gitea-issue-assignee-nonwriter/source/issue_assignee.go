// Fixed excerpts from go-gitea/gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b.
// Original path and ranges: routers/api/v1/repo/issue_assignee.go:20-65,189-238.

// AddIssueAssignees add assignees to an issue
func AddIssueAssignees(ctx *context.APIContext) {
	// swagger:operation POST /repos/{owner}/{repo}/issues/{index}/assignees issue issueAddAssignees
	// ---
	// summary: Add assignees to an issue
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
	//   required: true
	//   schema:
	//     "$ref": "#/definitions/IssueAssigneesOption"
	// responses:
	//   "201":
	//     "$ref": "#/responses/Issue"
	//   "400":
	//     "$ref": "#/responses/error"
	//   "403":
	//     "$ref": "#/responses/forbidden"
	//   "404":
	//     "$ref": "#/responses/notFound"
	//   "422":
	//     "$ref": "#/responses/validationError"

	opts := web.GetForm[*api.IssueAssigneesOption](ctx)
	updateIssueAssignees(ctx, *opts, true)
}

// Upstream lines 66-188 are outside this fixed task crop.

func updateIssueAssignees(ctx *context.APIContext, opts api.IssueAssigneesOption, isAdd bool) {
	issue, err := issues_model.GetIssueByIndex(ctx, ctx.Repo.Repository.ID, ctx.PathParamInt64("index"))
	if err != nil {
		ctx.APIErrorAuto(err)
		return
	}

	if !ctx.Repo.Permission.CanWriteIssuesOrPulls(issue.IsPull) {
		ctx.Status(http.StatusForbidden)
		return
	}

	if err := issue.LoadAttributes(ctx); err != nil {
		ctx.APIErrorInternal(err)
		return
	}

	assigneeIDs, err := user_model.GetUserIDsByNames(ctx, opts.Assignees, false)
	if err != nil {
		if user_model.IsErrUserNotExist(err) {
			ctx.APIError(http.StatusUnprocessableEntity, err.Error())
			return
		}
		ctx.APIErrorAuto(err)
		return
	}

	if isAdd {
		err = issue_service.AddAssignees(ctx, issue, ctx.Doer, assigneeIDs)
	} else {
		err = issue_service.RemoveAssignees(ctx, issue, ctx.Doer, assigneeIDs)
	}

	if err != nil {
		ctx.APIErrorAuto(err)
		return
	}

	issue, err = issues_model.GetIssueByID(ctx, issue.ID)
	if err != nil {
		ctx.APIErrorInternal(err)
		return
	}

	status := http.StatusOK
	if isAdd {
		status = http.StatusCreated
	}
	ctx.JSON(status, convert.ToAPIIssue(ctx, ctx.Doer, issue))
}
