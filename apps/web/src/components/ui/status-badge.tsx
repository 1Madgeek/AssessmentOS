import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const toneClass = {
  success:
    "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  muted: "text-muted-foreground",
  neutral: "text-foreground",
  warning:
    "border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-400",
  danger:
    "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

export type StatusBadgeTone = keyof typeof toneClass;

/** Outline label badge — not a primary button look. */
export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusBadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn(toneClass[tone], className)}>
      {children}
    </Badge>
  );
}

export const filterSelectClass =
  "h-8 min-w-[8.5rem] rounded-none border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30";
