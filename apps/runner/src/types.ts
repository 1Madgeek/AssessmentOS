import type { CodingConfig } from "@assessment-os/question-coding";

export type RunTestInput = {
  id: string;
  stdin: string;
  expectedStdout: string;
};

export type RunTestResult = {
  id: string;
  passed: boolean;
  stdout: string;
  stderr: string;
  status: string;
  time?: string;
  memory?: number;
};

export type UnitFramework =
  | "pytest"
  | "jest"
  | "phpunit"
  | "junit"
  | "googletest";

export type UnitRunArgs = {
  language: CodingConfig["language"];
  entrySource: string;
  entryFile?: string;
  starterFiles?: Array<{ path: string; content: string }>;
  testCode: string;
  framework?: UnitFramework;
  timeLimitMs?: number;
  memoryMb?: number;
};

export type IoRunArgs = {
  source: string;
  languageId: number;
  tests: RunTestInput[];
  timeLimitMs?: number;
  memoryMb?: number;
  /** Optional Python checker; receives candidate stdout on stdin. */
  checkerCode?: string;
};
