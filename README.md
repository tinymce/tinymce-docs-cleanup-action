# TinyMCE Docs Cleanup Action

This action tags s3 objects with `old=true` while updating their last modified date
for any non-current versions.
This is used in conjunction with a lifecycle rule to clean up old docs versions.

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