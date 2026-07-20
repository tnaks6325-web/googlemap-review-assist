import { describe, expect, it } from "vitest";
import {
  reviewerAccountSwitcherReducer,
  type ReviewerAccountSwitcherState,
} from "@/components/auth/ReviewerAccountSwitcher";

describe("reviewer account switcher", () => {
  const closed: ReviewerAccountSwitcherState = {
    open: false,
  };

  it("opens the account chooser dialog", () => {
    expect(reviewerAccountSwitcherReducer(closed, "open")).toEqual({
      open: true,
    });
  });

  it("closes the account chooser dialog", () => {
    expect(
      reviewerAccountSwitcherReducer(
        {
          open: true,
        },
        "close",
      ),
    ).toEqual(closed);
  });
});
