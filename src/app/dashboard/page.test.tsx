import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PpcDashboardPage from "./page";

describe("PPC performance dashboard", () => {
  it("renders the three-panel weekly documentation workspace", () => {
    render(<PpcDashboardPage />);
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reporting Periods" })).toBeInTheDocument();
    expect(screen.getByLabelText("Weekly PPC Performance Notes")).toBeInTheDocument();
  });
});
