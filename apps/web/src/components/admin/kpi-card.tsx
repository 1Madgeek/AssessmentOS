import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1 pt-(--card-spacing)">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "font-heading text-2xl font-semibold tracking-tight tabular-nums",
            tone === "success" && "text-emerald-700 dark:text-emerald-400",
            tone === "warning" && "text-amber-700 dark:text-amber-400",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
