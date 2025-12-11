# TinyMCE Docs Cleanup Action

This action tags s3 objects with `old=true` while updating their last modified date
for any non-current versions.
This is used in conjunction with a lifecycle rule to clean up old docs versions.

## Why does this exist

### What is a github action
A GitHub action is a reusable component of a GitHub workflow. When specifying
a GitHub action in a workflow you specify a tag like `v1.0` and GitHub will
checkout that tag for the named repository, read the action.yml and run the
script file specified.

### Why is there compiled code committed
The script referenced in `action.yml` must contain all dependencies by bundling
or the node_modules folder must be checked in as well. I chose to use bundling
as at least that allows for tree-shaking to reduce the size.

### Why can't this script be in the tinymce-docs repo
The `tinymce-docs` repo uses a complex structure where there is a orchestration
branch `main` and multiple content branches: `tinymce/5`, `tinymce/6`, `tinymce/7`
and `tinymce/8`. PRs are made off the content branches and merge back to the
content branches. To release a workflow is run on the orchestration branch
which collects the content from all the content branches before publishing it.

This means that there are independent github workflows on each of the working
branches which do mostly the same thing with minor tweaks. That means if we
wanted to put this code in the tinymce-docs repo it would have to be duplicated
at least 5 times and become impossible to maintain.

### Why not put multiple actions in a single repo
Apparently that is possible (see https://github.com/github/codeql-action) but
I was unaware of that possiblity at the time of writing. The downside appears
to be that tags are shared between actions and that we would not be able to
publish the action on GitHub marketplace.

## Inputs


### `bucket`

**Required** The bucket to do the tagging in.


### `folder`

**Required** The folder in the bucket where all the docs runs have been put.

### `parallel`

The number of objects to tag in parallel which can improve throughput. Default: 5

## Outputs


## Example usage

```yaml
uses: tinymce/tinymce-docs-cleanup-action@v1.0
with:
  bucket: tiny-cloud-antora-docs-preview
  folder: main
  parallel: 10
```

## Development

Open in devcontainer which has 2 containers:
- app
- s3

The node container is the main one and has environment variables setup to connect
AWS tools to the minio container.

The app container also has the AWS CLI installed.

If you wish to use the minio GUI (it's not very useful) then run `docker ps` on
the host machine to find the mapped port. 
The credentials are in `.devcontainer/docker-compose.yml`.

### Test
```bash
yarn test
```

### Build
```bash
yarn build
```

### Release

0. Run `yarn tsc`, `yarn eslint` and `yarn test` to check the build.
1. Bump `package.json` version.
2. Build outputs with `yarn build` and commit.
3. Tag commit with `git tag -a v1.0 -m "Release 1.0"`
4. Push commit with tag `git push --follow-tags`