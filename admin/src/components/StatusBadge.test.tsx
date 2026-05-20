import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders a human-readable label for a known status", () => {
    render(<StatusBadge status="activated" />);
    expect(screen.getByText("Activated")).toBeInTheDocument();
  });

  it("falls back to the raw status when it is unknown", () => {
    render(<StatusBadge status="mystery" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });
});
