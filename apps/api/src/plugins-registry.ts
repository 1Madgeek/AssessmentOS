import { PluginRegistry } from "@assessment-os/core";
import { mcqPlugin } from "@assessment-os/question-mcq";
import { codingPlugin } from "@assessment-os/question-coding";
import { sqlPlugin } from "@assessment-os/question-sql";
import { textPlugin } from "@assessment-os/question-text";
import { videoPlugin } from "@assessment-os/question-video";
import { designPlugin } from "@assessment-os/question-design";
import { filePlugin } from "@assessment-os/question-file";

export function createPluginRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(mcqPlugin);
  registry.register(codingPlugin);
  for (const p of [
    sqlPlugin,
    textPlugin,
    videoPlugin,
    designPlugin,
    filePlugin,
  ]) {
    registry.register(p);
  }
  return registry;
}

/** Strip hidden tests / hidden unit suites before sending coding config to candidates. */
export function candidateSafeConfig(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (type !== "coding") return config;
  const {
    hiddenTests: _hidden,
    hiddenTestCode: _hiddenCode,
    ...rest
  } = config as {
    hiddenTests?: unknown;
    hiddenTestCode?: unknown;
  } & Record<string, unknown>;
  return { ...rest, hiddenTests: [], hiddenTestCode: "" };
}
