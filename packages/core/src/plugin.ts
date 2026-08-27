import type { GradeResult, QuestionType } from "./types.js";

export type RendererProps<TConfig, TAnswer> = {
  config: TConfig;
  answer: TAnswer | null;
  workspace?: unknown;
  readOnly?: boolean;
  onChange: (answer: TAnswer) => void;
  onWorkspaceChange?: (workspace: unknown) => void;
  onRunVisible?: () => Promise<unknown>;
};

export type ReviewerProps<TConfig, TAnswer> = {
  config: TConfig;
  answer: TAnswer | null;
  workspace?: unknown;
  score: number | null;
  maxScore: number;
  gradeDetails?: Record<string, unknown> | null;
};

export type BuilderProps<TConfig> = {
  value: TConfig;
  onChange: (config: TConfig) => void;
};

/**
 * Contract every question plugin must implement.
 * UI components are typed loosely so core stays free of React.
 */
export interface QuestionPlugin<TConfig = unknown, TAnswer = unknown> {
  type: QuestionType | string;
  validateConfig(input: unknown): TConfig;
  /** Optional React builder component (web packages attach this). */
  Builder?: unknown;
  /** Optional React candidate renderer. */
  Renderer?: unknown;
  /** Optional React reviewer. */
  Reviewer?: unknown;
  grade(args: {
    config: TConfig;
    answer: TAnswer | null;
    workspace?: unknown;
    points: number;
  }): Promise<GradeResult>;
}

export class NotImplementedError extends Error {
  constructor(type: string) {
    super(`Question type "${type}" is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export class PluginRegistry {
  private plugins = new Map<string, QuestionPlugin>();

  register(plugin: QuestionPlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: string): QuestionPlugin {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new Error(`No plugin registered for question type "${type}"`);
    }
    return plugin;
  }

  has(type: string): boolean {
    return this.plugins.has(type);
  }

  list(): string[] {
    return [...this.plugins.keys()];
  }
}
