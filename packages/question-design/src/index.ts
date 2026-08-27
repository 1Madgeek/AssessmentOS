import { NotImplementedError, type QuestionPlugin } from "@assessment-os/core";

export const designPlugin: QuestionPlugin = {
  type: "design",
  validateConfig(_input: unknown): never {
    throw new NotImplementedError("design");
  },
  async grade(): Promise<never> {
    throw new NotImplementedError("design");
  },
};
