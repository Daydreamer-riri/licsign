import { createRoutesStub } from "react-router";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import LoginPage from "./Login";

// Smoke test for the framework-mode route module: createRoutesStub mounts the
// route's Component without running its clientLoader.
test("login route renders the sign-in form", async () => {
  const Stub = createRoutesStub([{ path: "/login", Component: LoginPage }]);
  render(<Stub initialEntries={["/login"]} />);

  expect(await screen.findByLabelText("Email")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
});
