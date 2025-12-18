import * as core from '@actions/core';

import {
  HeadObjectCommand,
  CopyObjectCommand,
  GetObjectTaggingCommand,
  ListObjectsCommand,
  S3Client,
  CommonPrefix,
  ListObjectsOutput,
} from '@aws-sdk/client-s3';
import { isValidFolder, isValidGeneralPurposeBucketName } from './validation';
import { compareVersions, extractVersion, Version } from './version';
import { parallelGenerator } from './parallel';

/** Tag an object as old and update its last modified date. */
const keyTaggedAsOld = async (
  client: S3Client,
  bucket: string,
  key: string
) => {
  // first lookup metadata and content-type
  const data = await client.send(new HeadObjectCommand({
    Bucket: bucket,
    Key: key
  }));
  // perform a copy action to update the last modified action while adding the tag
  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: key,
    CopySource: `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`,
    ContentType: data.ContentType,
    CacheControl: data.CacheControl ?? 'max-age=0, stale-while-revalidate=86400',
    MetadataDirective: 'REPLACE',
    Metadata: {
      ...data.Metadata ?? {},
      'old-at': (new Date()).toISOString() // we must add something to the metadata
    },
    TaggingDirective: 'REPLACE',
    Tagging: 'old=true'
  }));
};

/** Check if an object is tagged as old. */
const isKeyTaggedAsOld = async (
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> => {
  const tags = await client.send(new GetObjectTaggingCommand({
    Bucket: bucket,
    Key: key
  }));

  return tags.TagSet?.some((tag) => tag.Key === 'old' && tag.Value === 'true') ?? false;
};

/** Tag all objects in a prefix as old, updating their last modified date. */
const prefixTaggedAsOld = async (
  client: S3Client,
  bucket: string,
  prefix: string,
  parallel: number,
) => {
  const tagger = function* (list: ListObjectsOutput) {
    if (list.Contents) {
      for (const o of list.Contents) {
        if (o.Key) {
          yield keyTaggedAsOld(client, bucket, o.Key);
        }
      }
    }
  };

  let marker: string | undefined;
  let isTruncated = true;

  while (isTruncated) {
    const data = await client.send(new ListObjectsCommand({
      Bucket: bucket,
      Prefix: prefix,
      Marker: marker
    }));

    const tasks = parallelGenerator(parallel, tagger(data));
    let result = await tasks.next();
    while (!result.done) {
      result = await tasks.next();
    }

    isTruncated = data.IsTruncated ?? false;
    marker = data.NextMarker ?? data.Contents?.at(-1)?.Key;
  }
};

/** Checks if the first key in a prefix has been tagged as old. */
const isPrefixTaggedAsOld = async (
  client: S3Client,
  bucket: string,
  prefix: string
): Promise<boolean> => {
  const list = await client.send(new ListObjectsCommand({
    Bucket: bucket,
    Prefix: prefix,
    MaxKeys: 1
  }));
  const key = list.Contents?.[0]?.Key;
  return key != null && await isKeyTaggedAsOld(client, bucket, key);
};

/** List all versions of a folder. */
const listVersions = async (
  client: S3Client,
  bucket: string,
  folder: string,
) => {
  let versions: Version[] = [];

  let marker: string | undefined;
  let isTruncated = true;
  const trimPrefix = (c: CommonPrefix) => c.Prefix?.slice(folder.length + 1, -1) ?? '';

  while (isTruncated) {
    const data = await client.send(new ListObjectsCommand({
      Bucket: bucket,
      Prefix: `${folder}/`,
      Delimiter: '/',
      Marker: marker
    }));
    versions = [
      ...versions,
      ...((data.CommonPrefixes ?? []).map(trimPrefix).map(extractVersion).filter((v) => v != null))
    ];

    isTruncated = data.IsTruncated ?? false;
    marker = data.NextMarker;
  }
  return versions;
};

/** Find all versions older than the current release and tag them as old. */
const tagOldVersions = async (
  client: S3Client,
  bucket: string,
  folder: string,
  parallel: number,
) => {
  const ptrData = await client.send(new HeadObjectCommand({
    Bucket: bucket,
    Key: `${folder}/index.html`
  }));
  const currentVersion = extractVersion(ptrData.Metadata?.pointer);
  if (!currentVersion) {
    throw new Error(`No current version pointer found for ${folder}`);
  }
  core.info(`Current version: ${currentVersion.version}`);
  let versionPrefixes = await listVersions(client, bucket, folder);
  core.info(`Found ${versionPrefixes.length} version prefixes`);
  versionPrefixes = versionPrefixes.filter((v) => compareVersions(v, currentVersion) < 0);
  for (const v of versionPrefixes) {
    const prefix = `${folder}/${v.version}/`;
    if (!await isPrefixTaggedAsOld(client, bucket, prefix)) {
      core.info(`Tagging ${prefix} as old`);
      await prefixTaggedAsOld(client, bucket, prefix, parallel);
    }
  }
};

/** Get the bucket input */
const inputBucket = () => {
  const bucket = core.getInput('bucket');
  if (!isValidGeneralPurposeBucketName(bucket)) {
    throw new Error(`Invalid bucket name, got ${bucket}`);
  }
  return bucket;
};

/** Get the folder input */
const inputFolder = () => {
  const folder = core.getInput('folder');
  if (!isValidFolder(folder)) {
    throw new Error(`Invalid folder name, got ${folder}`);
  }
  return folder;
};

/** Get the parallel input */
const inputParallel = () => {
  const parallel = parseInt(core.getInput('parallel'), 10);
  if (Number.isNaN(parallel) || parallel < 1) {
    throw new Error(`Invalid integer value for parallel, got ${core.getInput('parallel')}`);
  }
  return parallel;
};

/** Run the program */
const main = async () => {
  const bucket = inputBucket();
  const folder = inputFolder();
  const parallel = inputParallel();
  const client = new S3Client({ forcePathStyle: true });
  await tagOldVersions(client, bucket, folder, parallel);
};

/**
 * Run the action and report errors.
 */
export const run = async () => {
  core.debug('Starting tinymce-docs-cleanup-action');
  try {
    await main();
  } catch (err) {
    if (typeof err === 'string' || err instanceof Error) {
      core.setFailed(err);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      core.setFailed(err !== undefined ? String(err) : 'unknown error');
    }
  }
};