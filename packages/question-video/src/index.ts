import { NotImplementedError, type QuestionPlugin } from "@assessment-os/core";

export const videoPlugin: QuestionPlugin = {
  type: "video",
  validateConfig(_input: unknown): never {
    throw new NotImplementedError("video");
  },
  async grade(): Promise<never> {
    throw new NotImplementedError("video");
  },
};
