import { describe, expect, it } from "vitest";
import {
  isOpen,
  missingRequired,
  stageOf,
  STAGE_LABEL,
  type ReviewState,
  type SurveyQuestion,
} from "./submissions";

const base = { review_state: "submitted" as ReviewState };

describe("stageOf", () => {
  it("reports what the fan is actually waiting on", () => {
    expect(stageOf(base)).toBe("submitted");
    expect(stageOf({ review_state: "in_review" })).toBe("in_review");
    expect(stageOf({ review_state: "accepted" })).toBe("accepted");
  });

  it("separates accepted from being made, since a converted product exists", () => {
    expect(stageOf({ review_state: "accepted", converted_product_id: "p1" })).toBe("in_production");
    expect(stageOf({ review_state: "accepted", converted_design_id: "d1" })).toBe("in_production");
  });

  it("lets a decline or archive win over a stale conversion pointer", () => {
    expect(stageOf({ review_state: "declined", converted_product_id: "p1" })).toBe("declined");
    expect(stageOf({ review_state: "archived", converted_product_id: "p1" })).toBe("archived");
  });

  it("has a label for every stage it can produce", () => {
    const states: ReviewState[] = ["submitted", "in_review", "accepted", "declined", "archived"];
    for (const review_state of states) {
      expect(STAGE_LABEL[stageOf({ review_state })]).toBeTruthy();
      expect(STAGE_LABEL[stageOf({ review_state, converted_product_id: "p1" })]).toBeTruthy();
    }
  });
});

describe("isOpen", () => {
  it("counts only the ones still owed an answer", () => {
    expect(isOpen({ review_state: "submitted" })).toBe(true);
    expect(isOpen({ review_state: "in_review" })).toBe(true);
    expect(isOpen({ review_state: "accepted" })).toBe(false);
    expect(isOpen({ review_state: "declined" })).toBe(false);
  });
});

function q(id: string, required: boolean): SurveyQuestion {
  return { id, position: 1, type: "short_text", prompt: `Q ${id}`, help_text: null, required, options: [] };
}

describe("missingRequired", () => {
  it("is empty when nothing is required", () => {
    expect(missingRequired([q("a", false)], [])).toEqual([]);
  });

  it("names the unanswered required questions", () => {
    expect(missingRequired([q("a", true), q("b", true)], [{ question_id: "a", text_value: "yes" }])).toEqual(["Q b"]);
  });

  it("treats whitespace as unanswered", () => {
    expect(missingRequired([q("a", true)], [{ question_id: "a", text_value: "   " }])).toEqual(["Q a"]);
  });

  it("accepts a choice with no text as an answer", () => {
    expect(missingRequired([q("a", true)], [{ question_id: "a", selected_option_ids: ["o1"] }])).toEqual([]);
  });

  it("treats an empty choice array as unanswered", () => {
    expect(missingRequired([q("a", true)], [{ question_id: "a", selected_option_ids: [] }])).toEqual(["Q a"]);
  });
});
