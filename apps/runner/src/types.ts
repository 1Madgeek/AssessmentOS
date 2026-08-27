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

export type UnitRunArgs = {
  language: CodingConfig["language"];
  entrySource: string;
  entryFile?: string;
  starterFiles?: Array<{ path: string; content: string }>;
  testCode: string;
  framework?: "pytest" | "jest" | "phpunit";
  timeLimitMs?: number;
};
