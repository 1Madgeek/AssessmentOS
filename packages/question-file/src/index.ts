import { NotImplementedError, type QuestionPlugin } from "@assessment-os/core";

export const filePlugin: QuestionPlugin = {
  type: "file",
  validateConfig(_input: unknown): never {
    throw new NotImplementedError("file");
  },
  async grade(): Promise<never> {
    throw new NotImplementedError("file");
  },
};
