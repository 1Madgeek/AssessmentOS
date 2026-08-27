import { NotImplementedError, type QuestionPlugin } from "@assessment-os/core";

export const textPlugin: QuestionPlugin = {
  type: "text",
  validateConfig(_input: unknown): never {
    throw new NotImplementedError("text");
  },
  async grade(): Promise<never> {
    throw new NotImplementedError("text");
  },
};
