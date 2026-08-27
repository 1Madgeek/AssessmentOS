import { NotImplementedError, type QuestionPlugin } from "@assessment-os/core";

export const sqlPlugin: QuestionPlugin = {
  type: "sql",
  validateConfig(_input: unknown): never {
    throw new NotImplementedError("sql");
  },
  async grade(): Promise<never> {
    throw new NotImplementedError("sql");
  },
};
