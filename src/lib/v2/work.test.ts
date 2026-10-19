import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { projectSignal, dueLabel, dueState, focusQueue, groupByStatus, nextStatus, priorityOf, weekDays, type TaskRow } from "./work";

const task = (over: Partial<TaskRow>): TaskRow =>
  ({
    id: over.id ?? "t",
    title: "t",
    description: null,
    status: "todo",
    priority: 2,
    due_date: null,
    assigned_to: null,
    completed_at: null,
    created_at: "2026-10-01T00:00:00Z",
    created_by: null,
    organization_id: "o",
    tags: [],
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  }) as TaskRow;

const TODAY = "2026-10-19";

describe("due dates", () => {
  it("compares plain dates in local days", () => {
    expect(dueState(task({ due_date: "2026-10-18" }), TODAY)).toBe("overdue");
    expect(dueState(task({ due_date: "2026-10-19" }), TODAY)).toBe("today");
    expect(dueState(task({ due_date: "2026-10-25" }), TODAY)).toBe("soon");
    expect(dueState(task({ due_date: "2026-11-30" }), TODAY)).toBe("later");
    expect(dueState(task({}), TODAY)).toBe("none");
  });

  it("a finished task is never overdue", () => {
    expect(dueState(task({ due_date: "2026-01-01", status: "done" }), TODAY)).toBe("done");
  });

  it("labels say what they mean", () => {
    expect(dueLabel(task({ due_date: "2026-10-19" }), TODAY)).toBe("Due today");
    expect(dueLabel(task({ due_date: "2026-10-20" }), TODAY)).toBe("Due tomorrow");
    expect(dueLabel(task({ due_date: "2026-10-10" }), TODAY)).toMatch(/^Overdue/);
    expect(dueLabel(task({}), TODAY)).toBe("No due date");
  });
});

describe("focusQueue", () => {
  it("puts overdue, then today, then blocked, then high priority first and drops done work", () => {
    const q = focusQueue(
      [
        task({ id: "low", priority: 3 }),
        task({ id: "done", status: "done", due_date: "2026-10-01" }),
        task({ id: "high", priority: 1 }),
        task({ id: "blocked", status: "blocked" }),
        task({ id: "today", due_date: "2026-10-19" }),
        task({ id: "late", due_date: "2026-10-12" }),
      ],
      TODAY,
    );
    expect(q.map((t) => t.id)).toEqual(["late", "today", "blocked", "high", "low"]);
  });
});

describe("board", () => {
  it("groups every status, including blocked", () => {
    const g = groupByStatus([task({ status: "blocked" }), task({ status: "done" }), task({})]);
    expect(g.blocked).toHaveLength(1);
    expect(g.done).toHaveLength(1);
    expect(g.todo).toHaveLength(1);
    expect(g.in_progress).toHaveLength(0);
  });

  it("moves work forward and reopens finished work", () => {
    expect(nextStatus("todo")).toBe("in_progress");
    expect(nextStatus("in_progress")).toBe("done");
    expect(nextStatus("blocked")).toBe("in_progress");
    expect(nextStatus("done")).toBe("todo");
  });

  it("uses V1's priority scale with words, not only colour", () => {
    expect(priorityOf(1)).toEqual({ label: "High", tone: "red" });
    expect(priorityOf(2)).toEqual({ label: "Medium", tone: "slate" }); // yellow is reserved for review
    expect(priorityOf(3).label).toBe("Low");
  });

  it("builds a seven-day week across a month boundary", () => {
    expect(weekDays("2026-10-29")).toEqual([
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
  });
});


describe("projectSignal", () => {
  it("speaks the approved status language with words", () => {
    expect(projectSignal({ projectStatus: "requested", waitingOnAx: true, closed: false })).toEqual({ label: "New request", tone: "red" });
    expect(projectSignal({ projectStatus: "in_progress", waitingOnAx: false, closed: false }).tone).toBe("blue");
    expect(projectSignal({ projectStatus: "feedback", waitingOnAx: false, closed: false }).tone).toBe("amber");
    expect(projectSignal({ projectStatus: "approved", waitingOnAx: false, closed: false }).tone).toBe("green");
    expect(projectSignal({ projectStatus: "in_progress", waitingOnAx: false, closed: true }).label).toBe("Closed");
  });
});
