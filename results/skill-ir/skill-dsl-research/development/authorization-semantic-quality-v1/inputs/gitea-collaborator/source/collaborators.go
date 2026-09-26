// Fixed excerpt from go-gitea/gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b.
// Original path and range: routers/api/v1/repo/collaborators.go:247-301.

// GetRepoPermissions gets repository permissions for a user
func GetRepoPermissions(ctx *context.APIContext) {
	// swagger:operation GET /repos/{owner}/{repo}/collaborators/{collaborator}/permission repository repoGetRepoPermissions
	// ---
	// summary: Get repository permissions for a user
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
	// - name: collaborator
	//   in: path
	//   description: username of the collaborator whose permissions are to be obtained
	//   type: string
	//   required: true
	// responses:
	//   "200":
	//     "$ref": "#/responses/RepoCollaboratorPermission"
	//   "404":
	//     "$ref": "#/responses/notFound"
	//   "403":
	//     "$ref": "#/responses/forbidden"

	collaboratorUsername := ctx.PathParam("collaborator")
	if !ctx.Doer.IsAdmin && !strings.EqualFold(ctx.Doer.LowerName, collaboratorUsername) && !ctx.IsUserRepoAdmin() {
		ctx.APIError(http.StatusForbidden, "Only admins can query all permissions, repo admins can query all repo permissions, collaborators can query only their own")
		return
	}

	collaborator, err := user_model.GetUserByName(ctx, collaboratorUsername)
	if err != nil {
		if user_model.IsErrUserNotExist(err) {
			ctx.APIError(http.StatusNotFound, err.Error())
		} else {
			ctx.APIErrorInternal(err)
		}
		return
	}

	permission, err := access_model.GetIndividualUserRepoPermission(ctx, ctx.Repo.Repository, collaborator)
	if err != nil {
		ctx.APIErrorInternal(err)
		return
	}

	ctx.JSON(http.StatusOK, convert.ToUserAndPermission(ctx, collaborator, ctx.ContextUser, permission.AccessMode))
}
