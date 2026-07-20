import { describe, expect, it } from "vitest";
import {
  reviewerAccountSwitcherReducer,
  type ReviewerAccountSwitcherState,
} from "@/components/auth/ReviewerAccountSwitcher";

describe("reviewer account switcher", () => {
  const closed: ReviewerAccountSwitcherState = {
    open: false,
    addingAccount: false,
  };

  it("opens on the add-account prompt before showing Google account selection", () => {
    expect(reviewerAccountSwitcherReducer(closed, "open")).toEqual({
      open: true,
      addingAccount: false,
    });
  });

  it("shows Google account selection after the add-account action", () => {
    expect(
      reviewerAccountSwitcherReducer(
        {
          open: true,
          addingAccount: false,
        },
        "add-account",
      ),
    ).toEqual({
      open: true,
      addingAccount: true,
    });
  });

  it("resets the add-account step when the dialog closes", () => {
    expect(
      reviewerAccountSwitcherReducer(
        {
          open: true,
          addingAccount: true,
        },
        "close",
      ),
    ).toEqual(closed);
  });
});
