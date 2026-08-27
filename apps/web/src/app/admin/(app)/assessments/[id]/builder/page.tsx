"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical } from "lucide-react";
import type {
  Assessment,
  AssessmentQuestion,
  AssessmentSection,
  BankQuestion,
  OrgRole,
} from "@assessment-os/sdk";
import { getErrorMessage } from "@assessment-os/sdk";
import { api, getActiveOrgId, setActiveOrgId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui/status-badge";
import { AssessmentQuestionEditor } from "@/components/admin/assessment-question-editor";
import type { AssessmentQuestionEditorValues } from "@/components/admin/assessment-question-editor";
import { AssessmentQuestionPreview } from "@/components/admin/assessment-question-preview";
import {
  isQuestionType,
  selectClass,
  type QuestionType,
} from "@/components/admin/question-defaults";
import { errorClass, mutedClass, pageClass } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

const UNSECTIONED = "__unsectioned__";

type PanelMode = "preview" | "edit";
type CreatingState = { sectionId: string | null; type: QuestionType };

function questionTypeTone(type: string): StatusBadgeTone {
  switch (type) {
    case "coding":
      return "success";
    case "sql":
      return "warning";
    case "text":
      return "muted";
    default:
      return "neutral";
  }
}

function questionKey(q: AssessmentQuestion): string {
  return q.question.id;
}

function resetDraftsFromAssessment(a: Assessment): {
  sectionDrafts: Record<string, string>;
  poolDrafts: Record<string, { name: string; drawCount: number }>;
} {
  const sectionDrafts: Record<string, string> = {};
  for (const s of a.sections ?? []) {
    sectionDrafts[s.id] = s.title;
  }
  const poolDrafts: Record<string, { name: string; drawCount: number }> = {};
  for (const p of a.pools ?? []) {
    poolDrafts[p.id] = { name: p.name, drawCount: p.drawCount };
  }
  return { sectionDrafts, poolDrafts };
}

function isQuestionDraftDirty(
  link: AssessmentQuestion,
  draft: AssessmentQuestionEditorValues,
): boolean {
  const q = link.question;
  if (draft.title.trim() !== q.title) return true;
  if (draft.points !== q.points) return true;
  if (draft.timeLimitSeconds !== q.timeLimitSeconds) return true;
  if (JSON.stringify(draft.config) !== JSON.stringify(q.config)) return true;
  const originalPrompt = q.promptDoc ?? q.prompt;
  if (JSON.stringify(draft.promptDoc) !== JSON.stringify(originalPrompt)) {
    return true;
  }
  return false;
}

function buildContainers(
  assessment: Assessment,
): Record<string, string[]> {
  const sections = (assessment.sections ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);
  const questions = (assessment.questions ?? []).slice();
  const bySection = new Map<string, AssessmentQuestion[]>();
  for (const s of sections) bySection.set(s.id, []);
  const unsectioned: AssessmentQuestion[] = [];
  for (const q of questions) {
    if (q.sectionId && bySection.has(q.sectionId)) {
      bySection.get(q.sectionId)!.push(q);
    } else {
      unsectioned.push(q);
    }
  }
  const containers: Record<string, string[]> = {};
  for (const s of sections) {
    containers[s.id] = (bySection.get(s.id) ?? [])
      .sort((a, b) => a.order - b.order)
      .map(questionKey);
  }
  containers[UNSECTIONED] = unsectioned
    .sort((a, b) => a.order - b.order)
    .map(questionKey);
  return containers;
}

function SortableQuestionRow({
  link,
  assessmentId,
  canWrite,
  busy,
  expanded,
  panelMode,
  onTogglePreview,
  onEdit,
  onClosePanel,
  onDelete,
  onQuestionChange,
}: {
  link: AssessmentQuestion;
  assessmentId: string;
  canWrite: boolean;
  busy: boolean;
  expanded: boolean;
  panelMode: PanelMode;
  onTogglePreview: () => void;
  onEdit: () => void;
  onClosePanel: () => void;
  onDelete: (questionId: string, title: string) => void;
  onQuestionChange: (values: AssessmentQuestionEditorValues) => void;
}) {
  const id = questionKey(link);
  const q = link.question;
  const typeOk = isQuestionType(q.type);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !canWrite });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border border-border bg-background",
        isDragging && "opacity-50",
        expanded && "ring-1 ring-foreground/10",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-2 py-2">
        {canWrite ? (
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
          onClick={onTogglePreview}
          aria-expanded={expanded}
        >
          <StatusBadge tone={questionTypeTone(q.type)}>{q.type}</StatusBadge>
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {q.title}
          </span>
          <span className="tabular-nums text-xs text-muted-foreground">
            {q.points} pts
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        <div className="flex flex-wrap gap-2">
          {canWrite && typeOk ? (
            <Button
              variant={expanded && panelMode === "edit" ? "default" : "outline"}
              size="sm"
              onPress={onEdit}
            >
              Edit
            </Button>
          ) : null}
          {canWrite ? (
            <Button
              variant="outline"
              size="sm"
              isDisabled={busy}
              onPress={() => onDelete(q.id, q.title)}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-border p-3">
          {panelMode === "preview" ? (
            <AssessmentQuestionPreview
              key={`preview-${q.id}`}
              assessmentId={assessmentId}
              link={link}
              showClose
              onClose={onClosePanel}
            />
          ) : canWrite && typeOk ? (
            <AssessmentQuestionEditor
              key={`edit-${q.id}`}
              mode="edit"
              type={q.type as QuestionType}
              busy={busy}
              showActions={false}
              initial={{
                title: q.title,
                prompt: q.prompt,
                promptDoc: q.promptDoc as AssessmentQuestionEditorValues["promptDoc"],
                points: q.points,
                timeLimitSeconds: q.timeLimitSeconds,
                config: q.config,
              }}
              onChange={onQuestionChange}
              onCancel={onClosePanel}
            />
          ) : (
            <p className={mutedClass}>
              Editing type “{q.type}” is not supported inline.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuestionDroppable({
  containerId,
  children,
}: {
  containerId: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "grid min-h-[2.5rem] gap-2 rounded-none border border-dashed border-transparent p-1",
        isOver && "border-primary/40 bg-muted/40",
      )}
    >
      {children}
    </div>
  );
}

function AddQuestionButtons({
  onAdd,
  disabled,
}: {
  onAdd: (type: QuestionType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        isDisabled={disabled}
        onPress={() => onAdd("mcq")}
      >
        Add MCQ
      </Button>
      <Button
        variant="outline"
        size="sm"
        isDisabled={disabled}
        onPress={() => onAdd("coding")}
      >
        Add coding
      </Button>
      <Button
        variant="outline"
        size="sm"
        isDisabled={disabled}
        onPress={() => onAdd("sql")}
      >
        Add SQL
      </Button>
      <Button
        variant="outline"
        size="sm"
        isDisabled={disabled}
        onPress={() => onAdd("text")}
      >
        Add short answer
      </Button>
    </div>
  );
}

function PoolFields({
  name,
  drawCount,
  onNameChange,
  onDrawChange,
  onDelete,
  canWrite,
  busy,
  memberCount,
}: {
  name: string;
  drawCount: number;
  onNameChange: (name: string) => void;
  onDrawChange: (drawCount: number) => void;
  onDelete: () => void;
  canWrite: boolean;
  busy: boolean;
  memberCount: number;
}) {
  if (!canWrite) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-muted-foreground">
          of {memberCount} members · draw {drawCount}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="max-w-[13.75rem]"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        aria-label="Pool name"
      />
      <Label className="font-normal">
        Draw{" "}
        <Input
          type="number"
          min={1}
          className="inline-block w-16"
          value={drawCount}
          onChange={(e) => onDrawChange(Number(e.target.value))}
        />
      </Label>
      <span className="text-sm text-muted-foreground">
        of {memberCount} members
      </span>
      <Button
        variant="outline"
        size="sm"
        isDisabled={busy}
        onPress={onDelete}
      >
        Delete pool
      </Button>
    </div>
  );
}

export default function AssessmentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [containers, setContainers] = useState<Record<string, string[]>>({});
  const [bankItems, setBankItems] = useState<BankQuestion[]>([]);
  const [sectionTitle, setSectionTitle] = useState("");
  const [poolName, setPoolName] = useState("");
  const [poolDraw, setPoolDraw] = useState(1);
  const [poolBankPick, setPoolBankPick] = useState<Record<string, string>>({});
  const [previewDraw, setPreviewDraw] = useState<
    Array<{ questionId: string; title: string; source: string }> | null
  >(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("preview");
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});
  const [poolDrafts, setPoolDrafts] = useState<
    Record<string, { name: string; drawCount: number }>
  >({});
  const [questionDraft, setQuestionDraft] =
    useState<AssessmentQuestionEditorValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<OrgRole | null>(null);
  const canWrite = role !== "reviewer";
  const savingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const syncFromAssessment = useCallback((a: Assessment) => {
    setAssessment(a);
    setContainers(buildContainers(a));
    if (!savingRef.current) {
      const { sectionDrafts: sections, poolDrafts: pools } =
        resetDraftsFromAssessment(a);
      setSectionDrafts(sections);
      setPoolDrafts(pools);
      setQuestionDraft(null);
    }
  }, []);

  const resetDraftsFrom = useCallback((a: Assessment) => {
    const { sectionDrafts: sections, poolDrafts: pools } =
      resetDraftsFromAssessment(a);
    setSectionDrafts(sections);
    setPoolDrafts(pools);
    setQuestionDraft(null);
  }, []);

  const reload = useCallback(async () => {
    const me = await api.me();
    if (!me) {
      router.replace("/admin/login");
      return;
    }
    const activeId =
      getActiveOrgId() ??
      me.activeOrganization?.id ??
      me.organizations[0]?.id ??
      null;
    if (activeId) setActiveOrgId(activeId);
    setRole(me.role);
    const a = await api.getAssessment(id);
    syncFromAssessment(a);
    try {
      setBankItems(await api.listBankQuestions());
    } catch {
      setBankItems([]);
    }
  }, [id, router, syncFromAssessment]);

  useEffect(() => {
    void reload().catch((err) =>
      setError(getErrorMessage(err, "Failed to load")),
    );
  }, [reload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#pools") {
      document.getElementById("pools")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [assessment]);

  const questionById = useMemo(() => {
    const map = new Map<string, AssessmentQuestion>();
    for (const q of assessment?.questions ?? []) {
      map.set(questionKey(q), q);
    }
    return map;
  }, [assessment]);

  const sortedSections = useMemo(
    () =>
      (assessment?.sections ?? []).slice().sort((a, b) => a.order - b.order),
    [assessment],
  );

  const dirty = useMemo(() => {
    if (!assessment) return false;
    if (creating != null) return true;

    const sectionsDirty = (assessment.sections ?? []).some((s) => {
      const draft = sectionDrafts[s.id] ?? s.title;
      return draft.trim() !== s.title;
    });
    if (sectionsDirty) return true;

    const poolsDirty = (assessment.pools ?? []).some((p) => {
      const draft = poolDrafts[p.id];
      if (!draft) return false;
      return draft.name.trim() !== p.name || draft.drawCount !== p.drawCount;
    });
    if (poolsDirty) return true;

    if (expandedId && panelMode === "edit" && questionDraft) {
      const link = questionById.get(expandedId);
      if (link && isQuestionDraftDirty(link, questionDraft)) return true;
    }

    return false;
  }, [
    assessment,
    creating,
    sectionDrafts,
    poolDrafts,
    expandedId,
    panelMode,
    questionDraft,
    questionById,
  ]);

  function closeQuestionPanel() {
    setExpandedId(null);
    setQuestionDraft(null);
  }

  function discardChanges() {
    if (!assessment) return;
    const wasDirty = dirty;
    resetDraftsFrom(assessment);
    setCreating(null);
    setExpandedId(null);
    setPanelMode("preview");
    if (wasDirty) toast.success("Discarded changes");
  }

  async function saveAll() {
    if (!assessment) return;
    setBusy(true);
    setError(null);
    savingRef.current = true;
    try {
      if (creating || (expandedId && panelMode === "edit")) {
        if (!questionDraft?.title.trim()) {
          toast.error("Question title is required");
          return;
        }
      }

      for (const s of assessment.sections ?? []) {
        const title = (sectionDrafts[s.id] ?? s.title).trim();
        if (!title) {
          toast.error("Section title is required");
          return;
        }
      }

      for (const p of assessment.pools ?? []) {
        const draft = poolDrafts[p.id];
        if (!draft) continue;
        if (!draft.name.trim()) {
          toast.error("Pool name is required");
          return;
        }
        if (!Number.isFinite(draft.drawCount) || draft.drawCount < 1) {
          toast.error("Draw count must be at least 1");
          return;
        }
      }

      let updated = assessment;

      for (const s of updated.sections ?? []) {
        const nextTitle = (sectionDrafts[s.id] ?? s.title).trim();
        if (nextTitle !== s.title) {
          updated = await api.updateSection(id, s.id, { title: nextTitle });
        }
      }

      for (const p of updated.pools ?? []) {
        const draft = poolDrafts[p.id];
        if (!draft) continue;
        if (draft.name.trim() !== p.name || draft.drawCount !== p.drawCount) {
          updated = await api.updatePool(id, p.id, {
            name: draft.name.trim(),
            drawCount: draft.drawCount,
          });
        }
      }

      if (creating && questionDraft) {
        updated = await api.addQuestion(id, {
          type: creating.type,
          title: questionDraft.title.trim(),
          promptDoc: questionDraft.promptDoc,
          timeLimitSeconds: questionDraft.timeLimitSeconds,
          points: questionDraft.points,
          config: questionDraft.config,
        });
        if (creating.sectionId) {
          const created = (updated.questions ?? [])
            .slice()
            .sort((a, b) => b.order - a.order)
            .find((q) => q.question.title === questionDraft.title.trim());
          if (created) {
            updated = await api.setQuestionSection(
              id,
              created.question.id,
              creating.sectionId,
            );
          }
        }
        setCreating(null);
      }

      if (expandedId && panelMode === "edit" && questionDraft) {
        const link = (updated.questions ?? []).find(
          (q) => questionKey(q) === expandedId,
        );
        if (link) {
          updated = await api.updateQuestion(id, link.question.id, {
            title: questionDraft.title.trim(),
            promptDoc: questionDraft.promptDoc,
            timeLimitSeconds: questionDraft.timeLimitSeconds,
            points: questionDraft.points,
            config: questionDraft.config,
          });
          setPanelMode("preview");
        }
      }

      updated = await api.getAssessment(id);
      syncFromAssessment(updated);
      resetDraftsFrom(updated);
      toast.success("Saved");
    } catch (err) {
      const message = getErrorMessage(err, "Save failed");
      setError(message);
      toast.error(message);
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  function findContainer(itemId: string): string | null {
    if (itemId in containers) return itemId;
    return (
      Object.keys(containers).find((key) =>
        containers[key]?.includes(itemId),
      ) ?? null
    );
  }

  async function persistOrder(
    nextContainers: Record<string, string[]>,
    movedQuestionId: string,
    newSectionContainer: string,
    previousSectionContainer: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      const newSectionId =
        newSectionContainer === UNSECTIONED ? null : newSectionContainer;
      if (newSectionContainer !== previousSectionContainer) {
        await api.setQuestionSection(id, movedQuestionId, newSectionId);
      }
      const sectionOrder = sortedSections.map((s) => s.id);
      const globalOrder = [
        ...sectionOrder.flatMap((sid) => nextContainers[sid] ?? []),
        ...(nextContainers[UNSECTIONED] ?? []),
      ];
      const updated = await api.reorderQuestions(id, globalOrder);
      syncFromAssessment(updated);
    } catch (err) {
      setError(getErrorMessage(err, "Reorder failed"));
      if (assessment) setContainers(buildContainers(assessment));
    } finally {
      setBusy(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeItemId = String(active.id);
    const overId = String(over.id);
    const activeContainer = findContainer(activeItemId);
    const overContainer =
      overId in containers ? overId : findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    setContainers((prev) => {
      const activeItems = prev[activeContainer] ?? [];
      const overItems = prev[overContainer] ?? [];
      const activeIndex = activeItems.indexOf(activeItemId);
      if (activeIndex < 0) return prev;
      let newIndex: number;
      if (overId in prev) {
        newIndex = overItems.length;
      } else {
        const overIndex = overItems.indexOf(overId);
        newIndex = overIndex >= 0 ? overIndex : overItems.length;
      }
      return {
        ...prev,
        [activeContainer]: activeItems.filter((x) => x !== activeItemId),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeItemId,
          ...overItems.slice(newIndex),
        ],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !canWrite) return;

    const activeItemId = String(active.id);
    const overId = String(over.id);
    const activeContainer = findContainer(activeItemId);
    const overContainer =
      overId in containers ? overId : findContainer(overId);
    if (!activeContainer || !overContainer) return;

    const previousContainers = assessment
      ? buildContainers(assessment)
      : containers;
    const previousSectionContainer =
      Object.keys(previousContainers).find((key) =>
        previousContainers[key]?.includes(activeItemId),
      ) ?? activeContainer;

    let next = containers;
    if (activeContainer === overContainer) {
      const items = containers[activeContainer] ?? [];
      const oldIndex = items.indexOf(activeItemId);
      const newIndex =
        overId in containers ? items.length - 1 : items.indexOf(overId);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        next = {
          ...containers,
          [activeContainer]: arrayMove(items, oldIndex, newIndex),
        };
        setContainers(next);
      }
    }

    void persistOrder(
      next,
      activeItemId,
      overContainer,
      previousSectionContainer,
    );
  }

  async function removeQuestion(questionId: string, title: string) {
    if (!window.confirm(`Delete question “${title}”? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      syncFromAssessment(await api.deleteQuestion(id, questionId));
      if (expandedId === questionId) {
        setExpandedId(null);
        setQuestionDraft(null);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Delete failed"));
    } finally {
      setBusy(false);
    }
  }

  function startCreate(sectionId: string | null, type: QuestionType) {
    setExpandedId(null);
    setQuestionDraft(null);
    setCreating({ sectionId, type });
  }

  async function moveSection(section: AssessmentSection, direction: -1 | 1) {
    const list = sortedSections;
    const index = list.findIndex((s) => s.id === section.id);
    const swapWith = list[index + direction];
    if (!swapWith) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateSection(id, section.id, { order: swapWith.order });
      const updated = await api.updateSection(id, swapWith.id, {
        order: section.order,
      });
      syncFromAssessment(updated);
    } catch (err) {
      setError(getErrorMessage(err, "Section reorder failed"));
    } finally {
      setBusy(false);
    }
  }

  function renderSectionBlock(
    title: string,
    containerId: string,
    section?: AssessmentSection,
  ) {
    const ids = containers[containerId] ?? [];
    return (
      <Card key={containerId}>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 grid gap-2">
              {section && canWrite ? (
                <Input
                  className="max-w-md font-medium"
                  value={sectionDrafts[section.id] ?? section.title}
                  aria-label="Section title"
                  onChange={(e) =>
                    setSectionDrafts((prev) => ({
                      ...prev,
                      [section.id]: e.target.value,
                    }))
                  }
                />
              ) : (
                <CardTitle>{title}</CardTitle>
              )}
              {section ? (
                <CardDescription>
                  Questions in this section appear together for candidates.
                </CardDescription>
              ) : (
                <CardDescription>
                  Questions not assigned to a section.
                </CardDescription>
              )}
            </div>
            {section && canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={busy || sortedSections[0]?.id === section.id}
                  onPress={() => void moveSection(section, -1)}
                >
                  Up
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={
                    busy ||
                    sortedSections[sortedSections.length - 1]?.id ===
                      section.id
                  }
                  onPress={() => void moveSection(section, 1)}
                >
                  Down
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={busy}
                  onPress={() =>
                    void (async () => {
                      if (
                        !window.confirm(
                          `Delete section “${section.title}”? Questions become unsectioned.`,
                        )
                      ) {
                        return;
                      }
                      setBusy(true);
                      try {
                        syncFromAssessment(
                          await api.deleteSection(id, section.id),
                        );
                      } catch (err) {
                        setError(getErrorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
          {canWrite ? (
            <AddQuestionButtons
              disabled={busy}
              onAdd={(type) =>
                startCreate(section?.id ?? null, type)
              }
            />
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3">
          {creating &&
          (creating.sectionId ?? null) === (section?.id ?? null) ? (
            <AssessmentQuestionEditor
              key={`new-${creating.sectionId ?? "none"}-${creating.type}`}
              mode="add"
              type={creating.type}
              busy={busy}
              showActions={false}
              onChange={setQuestionDraft}
              onCancel={() => {
                setCreating(null);
                setQuestionDraft(null);
              }}
            />
          ) : null}
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <QuestionDroppable containerId={containerId}>
              {ids.length === 0 && !creating ? (
                <p className={mutedClass}>No questions in this block.</p>
              ) : null}
              {ids.map((qid) => {
                const link = questionById.get(qid);
                if (!link) return null;
                const isExpanded = expandedId === qid;
                return (
                  <SortableQuestionRow
                    key={qid}
                    link={link}
                    assessmentId={id}
                    canWrite={canWrite}
                    busy={busy}
                    expanded={isExpanded}
                    panelMode={isExpanded ? panelMode : "preview"}
                    onTogglePreview={() => {
                      if (isExpanded && panelMode === "preview") {
                        closeQuestionPanel();
                      } else {
                        setCreating(null);
                        setQuestionDraft(null);
                        setExpandedId(qid);
                        setPanelMode("preview");
                      }
                    }}
                    onEdit={() => {
                      setCreating(null);
                      setQuestionDraft(null);
                      setExpandedId(qid);
                      setPanelMode("edit");
                    }}
                    onClosePanel={closeQuestionPanel}
                    onDelete={removeQuestion}
                    onQuestionChange={setQuestionDraft}
                  />
                );
              })}
            </QuestionDroppable>
          </SortableContext>
        </CardContent>
      </Card>
    );
  }

  const activeLink = activeId
    ? questionById.get(String(activeId)) ?? null
    : null;

  if (!assessment) {
    return (
      <main className={pageClass}>
        <p className={mutedClass}>Loading…</p>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Builder
          </h1>
          <p className={mutedClass}>
            {assessment.title || "Untitled assessment"} — sections, questions,
            and pools.
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              isDisabled={busy}
              onPress={discardChanges}
            >
              Discard
            </Button>
            <Button
              isDisabled={!dirty || busy}
              onPress={() => void saveAll()}
            >
              Save
            </Button>
          </div>
        ) : null}
      </div>

      {!canWrite ? (
        <p className={mutedClass}>
          Reviewer role — structure is read-only.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Add section</CardTitle>
            <CardDescription>
              Group fixed questions for candidates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-sm flex-1"
                placeholder="Section title"
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
              />
              <Button
                variant="outline"
                isDisabled={busy || !sectionTitle.trim()}
                onPress={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      syncFromAssessment(
                        await api.createSection(id, {
                          title: sectionTitle.trim(),
                        }),
                      );
                      setSectionTitle("");
                      toast.success("Section added");
                    } catch (err) {
                      const message = getErrorMessage(err);
                      setError(message);
                      toast.error(message);
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                Add section
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={canWrite ? handleDragStart : undefined}
        onDragOver={canWrite ? handleDragOver : undefined}
        onDragEnd={canWrite ? handleDragEnd : undefined}
      >
        {sortedSections.map((section) =>
          renderSectionBlock(section.title, section.id, section),
        )}
        {renderSectionBlock("Unsectioned", UNSECTIONED)}
        <DragOverlay>
          {activeLink ? (
            <div className="flex items-center gap-2 border border-border bg-background px-3 py-2 shadow-md">
              <StatusBadge tone={questionTypeTone(activeLink.question.type)}>
                {activeLink.question.type}
              </StatusBadge>
              <span className="text-sm font-medium">
                {activeLink.question.title}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Card id="pools">
        <CardHeader>
          <CardTitle>Question pools</CardTitle>
          <CardDescription>
            Draw N random questions from each pool at session start. Members
            come from the{" "}
            <Link
              href="/admin/bank"
              className="text-primary underline-offset-4 hover:underline"
            >
              question bank
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-xs flex-1"
                placeholder="Pool name"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
              />
              <Label className="font-normal">
                Draw{" "}
                <Input
                  type="number"
                  min={1}
                  className="inline-block w-16"
                  value={poolDraw}
                  onChange={(e) => setPoolDraw(Number(e.target.value))}
                />
              </Label>
              <Button
                variant="outline"
                isDisabled={busy || !poolName.trim()}
                onPress={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      syncFromAssessment(
                        await api.createPool(id, {
                          name: poolName.trim(),
                          drawCount: poolDraw,
                        }),
                      );
                      setPoolName("");
                      toast.success("Pool created");
                    } catch (err) {
                      const message = getErrorMessage(err);
                      setError(message);
                      toast.error(message);
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                Add pool
              </Button>
              <Button
                variant="outline"
                onPress={() =>
                  void (async () => {
                    const { preview } = await api.previewPools(id);
                    setPreviewDraw(preview);
                  })()
                }
              >
                Preview draw
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onPress={() =>
                void (async () => {
                  const { preview } = await api.previewPools(id);
                  setPreviewDraw(preview);
                })()
              }
            >
              Preview draw
            </Button>
          )}
          {previewDraw ? (
            <ol className="list-decimal pl-5 text-sm">
              {previewDraw.map((p) => (
                <li key={`${p.questionId}-${p.source}`}>
                  {p.title}{" "}
                  <span className="text-muted-foreground">({p.source})</span>
                </li>
              ))}
            </ol>
          ) : null}
          {(assessment.pools ?? []).length === 0 ? (
            <p className={mutedClass}>
              No pools yet.
              {canWrite
                ? " Create a pool, then add bank items as members."
                : null}
            </p>
          ) : null}
          {(assessment.pools ?? []).map((pool) => (
            <div
              key={pool.id}
              className="grid gap-3 border-t border-border pt-3"
            >
              <PoolFields
                name={poolDrafts[pool.id]?.name ?? pool.name}
                drawCount={poolDrafts[pool.id]?.drawCount ?? pool.drawCount}
                onNameChange={(name) =>
                  setPoolDrafts((prev) => ({
                    ...prev,
                    [pool.id]: {
                      name,
                      drawCount: prev[pool.id]?.drawCount ?? pool.drawCount,
                    },
                  }))
                }
                onDrawChange={(drawCount) =>
                  setPoolDrafts((prev) => ({
                    ...prev,
                    [pool.id]: {
                      name: prev[pool.id]?.name ?? pool.name,
                      drawCount,
                    },
                  }))
                }
                canWrite={canWrite}
                busy={busy}
                memberCount={pool.members.length}
                onDelete={() =>
                  void (async () => {
                    try {
                      syncFromAssessment(await api.deletePool(id, pool.id));
                      toast.success("Pool deleted");
                    } catch (err) {
                      toast.error(getErrorMessage(err, "Delete failed"));
                    }
                  })()
                }
              />
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {pool.members.map((m) => (
                  <li key={m.id}>
                    {m.question.title}{" "}
                    {canWrite ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto px-0"
                        onPress={() =>
                          void (async () => {
                            try {
                              syncFromAssessment(
                                await api.removePoolMember(id, pool.id, m.id),
                              );
                              toast.success("Member removed");
                            } catch (err) {
                              toast.error(
                                getErrorMessage(err, "Remove failed"),
                              );
                            }
                          })()
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canWrite ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={selectClass}
                    value={poolBankPick[pool.id] ?? ""}
                    onChange={(e) =>
                      setPoolBankPick((prev) => ({
                        ...prev,
                        [pool.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Add from bank…</option>
                    {bankItems.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} ({b.type})
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    isDisabled={!poolBankPick[pool.id]}
                    onPress={() =>
                      void (async () => {
                        const bankQuestionId = poolBankPick[pool.id];
                        if (!bankQuestionId) return;
                        try {
                          syncFromAssessment(
                            await api.addPoolMember(id, pool.id, {
                              bankQuestionId,
                            }),
                          );
                          setPoolBankPick((prev) => ({
                            ...prev,
                            [pool.id]: "",
                          }));
                          toast.success("Member added");
                        } catch (err) {
                          toast.error(getErrorMessage(err, "Add failed"));
                        }
                      })()
                    }
                  >
                    Add member
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
