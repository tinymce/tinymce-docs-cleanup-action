export interface Version {
  version: string;
  run: number;
  attempt: number;
}

export const extractVersion = (s: unknown): Version | undefined => {
  if (typeof s === 'string') {
    const m = /^run-(\d+)-(\d+)$/.exec(s);
    if (m != null) {
      const runNum = parseInt(m[1], 10);
      const attempt = parseInt(m[2], 10);
      if (!Number.isNaN(runNum) && !Number.isNaN(attempt)) {
        return { version: s, run: runNum, attempt };
      }
    }
  }
};

export const compareVersions = (a: Version, b: Version) => {
  const d = a.run - b.run;
  if (d === 0) {
    return a.attempt - b.attempt;
  } else {
    return d;
  }
};