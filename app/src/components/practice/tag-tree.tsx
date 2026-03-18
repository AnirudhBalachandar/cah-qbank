"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type TagNode = {
  id: string;
  name: string;
  kind: "topic" | "module" | "meta" | "ranZcogDomain";
  exam?: {
    isExamTag: true;
    role: "root" | "discipline" | "curriculum";
    rowIndex?: number;
    discipline?: string;
    percentOfExam?: number;
    examQuestionCount?: number;
    displayWeight?: string;
  };
  children?: TagNode[];
};

export function TagTree({
  nodes,
  selectedIds,
  onToggle,
  prioritizeExamTags = false,
}: {
  nodes: TagNode[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  prioritizeExamTags?: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const examRootNodes = useMemo(
    () => (prioritizeExamTags ? nodes.filter((node) => node.exam?.role === "root") : []),
    [nodes, prioritizeExamTags],
  );

  const examSectionNodes = useMemo(
    () => examRootNodes.flatMap((node) => (node.children && node.children.length > 0 ? node.children : [node])),
    [examRootNodes],
  );

  const nonExamNodes = useMemo(
    () => (prioritizeExamTags ? nodes.filter((node) => node.exam?.role !== "root") : nodes),
    [nodes, prioritizeExamTags],
  );

  const grouped = useMemo(() => {
    return {
      module: nonExamNodes.filter((node) => node.kind === "module"),
      topic: nonExamNodes.filter((node) => node.kind === "topic" || node.kind === "ranZcogDomain"),
      meta: nonExamNodes.filter((node) => node.kind === "meta"),
    };
  }, [nonExamNodes]);

  useEffect(() => {
    if (!prioritizeExamTags || examSectionNodes.length === 0) {
      return;
    }
    setExpandedIds((prev) => {
      if (prev.size > 0) {
        return prev;
      }
      const next = new Set(prev);
      for (const node of examSectionNodes) {
        if ((node.children?.length ?? 0) > 0) {
          next.add(node.id);
        }
      }
      return next;
    });
  }, [examSectionNodes, prioritizeExamTags]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const renderNode = (node: TagNode, depth: number) => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const expanded = expandedIds.has(node.id);

    return (
      <div key={node.id} className="space-y-1">
        <div className={cn("flex items-center gap-2 rounded-sm p-1 hover:bg-muted/50", depth > 0 && "ml-4")}>
          {hasChildren ? (
            <button
              type="button"
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              onClick={() => toggleExpanded(node.id)}
              aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <Checkbox
            id={`tag-${node.id}`}
            checked={selectedIds.has(node.id)}
            onCheckedChange={() => onToggle(node.id)}
            aria-label={`Select tag ${node.name}`}
          />
          <div className="min-w-0 flex-1">
            <label htmlFor={`tag-${node.id}`} className="cursor-pointer text-sm">
              {node.name}
            </label>
            {node.exam?.displayWeight ? (
              <p className="text-xs text-muted-foreground">{node.exam.displayWeight}</p>
            ) : null}
          </div>
        </div>

        {hasChildren && expanded ? <div>{node.children?.map((child) => renderNode(child, depth + 1))}</div> : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {prioritizeExamTags && examSectionNodes.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exam Blueprint</h4>
          <div className="space-y-1">{examSectionNodes.map((node) => renderNode(node, 0))}</div>
        </div>
      ) : null}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modules</h4>
        <div className="space-y-1">{grouped.module.map((node) => renderNode(node, 0))}</div>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Topics</h4>
        <div className="space-y-1">{grouped.topic.map((node) => renderNode(node, 0))}</div>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meta</h4>
        <div className="space-y-1">{grouped.meta.map((node) => renderNode(node, 0))}</div>
      </div>
    </div>
  );
}
