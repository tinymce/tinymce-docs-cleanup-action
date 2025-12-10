
import { spawn } from 'node:child_process';
import {
  S3Client, CreateBucketCommand, BucketAlreadyOwnedByYou, GetObjectCommand,
  HeadObjectCommand, S3ServiceException, PutObjectCommand, GetObjectTaggingCommand,
  CopyObjectCommand
} from '@aws-sdk/client-s3';
import { expect, test, beforeAll, beforeEach } from '@jest/globals';

interface SpawnAsyncResult {
  cmd: string[];
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error | undefined;
};

const spawnAsync = (cmd: string[]) => new Promise<SpawnAsyncResult>((resolve) => {
  const p = spawn(cmd[0], cmd.slice(1), { stdio: [ 'inherit', 'pipe', 'pipe' ] });
  p.stdout.setEncoding('utf-8');
  let out = '';
  let err = '';
  p.stdout.on('data', (chunk) => {
    out += chunk;
  });
  p.stderr.on('data', (chunk) => {
    err += chunk;
  });
  p.on('exit', (code, signal) => {
    const failed = code !== 0 || signal;
    const data = {
      cmd,
      stdout: out,
      stderr: err,
      status: code,
      signal,
      ...(failed ? { error: new Error(err) } : {}),
    };
    resolve(data);
  });
});

const createBucket = async (client: S3Client, bucket: string) => {
  try {
    await client.send(new CreateBucketCommand({
      Bucket: bucket
    }));
  } catch (err) {
    if (err instanceof BucketAlreadyOwnedByYou) {
      // ignore
    } else {
      throw err;
    }
  }
};

const emptyBucket = async (bucket: string) => {
  const result = await spawnAsync([ 'aws', 's3', 'rm', '--recursive', `s3://${bucket}` ]);
  if (result.error !== undefined) {
    throw result.error;
  }
};

const putFiles = async (client: S3Client, bucket: string, prefix: string, files: string[], contents: string[]) => {
  for (let i = 0; i < files.length; i++) {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}/${files[i]}`,
      Body: contents[i],
      ContentType: 'text/plain'
    }));
  }
};

const updateMetadata = async (client: S3Client, bucket: string, prefix: string, subpath: string, metadata: Record<string, string>) => {
  const key = `${prefix}/${subpath}`;
  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: key,
    CopySource: `${bucket}/${key}`,
    MetadataDirective: 'REPLACE',
    Metadata: metadata
  }));
};

const setPointer = async (client: S3Client, bucket: string, folder: string, version: string) => {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `${folder}/index.html`,
    Body: '<!doctype html><title>?</title>',
    ContentType: 'text/html',
    Metadata: {
      pointer: version
    }
  }));
};

const runAction = async () => {
  const result = await spawnAsync([ 'npx', '@github/local-action', '/workspaces/tinymce-docs-cleanup-action', 'src/main.ts', 'test-data/.env' ]);
  if (result.error !== undefined) {
    throw result.error;
  }
};

const existsInBucket = async (client: S3Client, bucket: string, prefix: string, subpath: string): Promise<boolean> => {
  const key = `${prefix}/${subpath}`;
  try {
    await client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    }));
    return true;
  } catch (err) {
    if (err instanceof S3ServiceException) {
      if (err.name === 'NotFound') {
        return false;
      }
    }
    throw err;
  }
};

const getMetadata = async (client: S3Client, bucket: string, prefix: string, subpath: string): Promise<Record<string, string>> => {
  const key = `${prefix}/${subpath}`;
  const data = await client.send(new HeadObjectCommand({
    Bucket: bucket,
    Key: key
  }));
  return data.Metadata ?? {};
};

const getContent = async (client: S3Client, bucket: string, prefix: string, subpath: string): Promise<string> => {
  const key = `${prefix}/${subpath}`;
  const data = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key
  }));
  return data.Body?.transformToString('utf-8') ?? '';
};

const getTags = async (client: S3Client, bucket: string, prefix: string, subpath: string): Promise<Record<string, string>> => {
  const key = `${prefix}/${subpath}`;
  const data = await client.send(new GetObjectTaggingCommand({
    Bucket: bucket,
    Key: key
  }));
  return Object.fromEntries((data.TagSet ?? []).map((t) => [ t.Key, t.Value ]));
};

// names
const BUCKET_NAME = 'tinymce-docs-cleanup-action';
const FOLDER = 'pr-123';
const RUNS = [ 'run-12-3', 'run-13-1', 'run-13-2', 'run-14-1' ];
const FILES = [ 'file-one.txt', 'file-two.txt', 'file-three.txt', 'dir-one/file-four.txt', 'dir-two/dir-three/file-five.txt' ];
const CONTENTS = [ 'one', 'two', 'three', 'four', 'five' ];

// client
const s3client = new S3Client({ forcePathStyle: true });

beforeAll(async () => {
  if (process.env.AWS_ENDPOINT_URL !== 'http://s3:9000') {
    throw new Error('Warning: the tests must be run inside the devcontainer!');
  }
  await createBucket(s3client, BUCKET_NAME);
});

beforeEach(async () => {
  await emptyBucket(BUCKET_NAME);
  for (const run of RUNS) {
    const prefix = `${FOLDER}/${run}`;
    await putFiles(s3client, BUCKET_NAME, prefix, FILES, CONTENTS);
    // Add some metadata to test files to verify it's preserved after tagging
    await updateMetadata(s3client, BUCKET_NAME, prefix, FILES[0], {
      'custom-key': 'custom-value',
      'version': run
    });
  }
  await setPointer(s3client, BUCKET_NAME, FOLDER, RUNS[2]);
}, 10000);

test('files are as expected before running action', async () => {
  // Verify all runs exist with their files
  for (const run of RUNS) {
    for (const file of FILES) {
      expect(await existsInBucket(s3client, BUCKET_NAME, `${FOLDER}/${run}`, file)).toBe(true);
    }
  }

  // Verify pointer is set correctly
  const pointerMetadata = await getMetadata(s3client, BUCKET_NAME, FOLDER, 'index.html');
  expect(pointerMetadata.pointer).toBe(RUNS[2]);

  // Verify metadata is set on test files
  for (const run of RUNS) {
    const metadata = await getMetadata(s3client, BUCKET_NAME, `${FOLDER}/${run}`, FILES[0]);
    expect(metadata['custom-key']).toBe('custom-value');
    expect(metadata.version).toBe(run);
    expect(metadata['old-at']).toBeUndefined();
  }

  // Verify no files have 'old' tag yet
  for (const run of RUNS) {
    const tags = await getTags(s3client, BUCKET_NAME, `${FOLDER}/${run}`, FILES[0]);
    expect(tags.old).toBeUndefined();
  }

  // Verify file contents are correct
  for (let i = 0; i < FILES.length; i++) {
    const content = await getContent(s3client, BUCKET_NAME, `${FOLDER}/${RUNS[0]}`, FILES[i]);
    expect(content).toBe(CONTENTS[i]);
  }
}, 10000);

test('files are as expected after running action', async () => {
  await runAction();

  // Verify all files still exist
  for (const run of RUNS) {
    for (const file of FILES) {
      expect(await existsInBucket(s3client, BUCKET_NAME, `${FOLDER}/${run}`, file)).toBe(true);
    }
  }

  // Verify old runs (run-12-3 and run-13-1) are tagged as old
  const oldRuns = [ RUNS[0], RUNS[1] ]; // run-12-3, run-13-1
  for (const run of oldRuns) {
    const tags = await getTags(s3client, BUCKET_NAME, `${FOLDER}/${run}`, FILES[0]);
    expect(tags.old).toBe('true');

    const metadata = await getMetadata(s3client, BUCKET_NAME, `${FOLDER}/${run}`, FILES[0]);
    expect(metadata['old-at']).toBeDefined();
    expect(metadata['old-at']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Verify existing metadata is preserved
    expect(metadata['custom-key']).toBe('custom-value');
    expect(metadata.version).toBe(run);

    // Verify file content is maintained
    for (let i = 0; i < FILES.length; i++) {
      const content = await getContent(s3client, BUCKET_NAME, `${FOLDER}/${run}`, FILES[i]);
      expect(content).toBe(CONTENTS[i]);
    }
  }

  // Verify current run (run-13-2) is NOT tagged as old
  const currentRun = RUNS[2];
  const currentTags = await getTags(s3client, BUCKET_NAME, `${FOLDER}/${currentRun}`, FILES[0]);
  expect(currentTags.old).toBeUndefined();

  const currentMetadata = await getMetadata(s3client, BUCKET_NAME, `${FOLDER}/${currentRun}`, FILES[0]);
  expect(currentMetadata['old-at']).toBeUndefined();
  expect(currentMetadata['custom-key']).toBe('custom-value');
  expect(currentMetadata.version).toBe(currentRun);

  // Verify newer run (run-14-1) is NOT tagged as old
  const newerRun = RUNS[3];
  const newerTags = await getTags(s3client, BUCKET_NAME, `${FOLDER}/${newerRun}`, FILES[0]);
  expect(newerTags.old).toBeUndefined();

  const newerMetadata = await getMetadata(s3client, BUCKET_NAME, `${FOLDER}/${newerRun}`, FILES[0]);
  expect(newerMetadata['old-at']).toBeUndefined();
  expect(newerMetadata['custom-key']).toBe('custom-value');
  expect(newerMetadata.version).toBe(newerRun);

  // Verify file contents are maintained for untagged runs
  for (let i = 0; i < FILES.length; i++) {
    const currentContent = await getContent(s3client, BUCKET_NAME, `${FOLDER}/${currentRun}`, FILES[i]);
    expect(currentContent).toBe(CONTENTS[i]);
    const newerContent = await getContent(s3client, BUCKET_NAME, `${FOLDER}/${newerRun}`, FILES[i]);
    expect(newerContent).toBe(CONTENTS[i]);
  }
}, 10000);