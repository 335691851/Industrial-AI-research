import test from "node:test";
import assert from "node:assert/strict";
import { canEdit } from "../src/server/security";

test("a configured workspace token unlocks only matching requests", () => {
  const prior = process.env.WORKSPACE_ACCESS_TOKEN;
  process.env.WORKSPACE_ACCESS_TOKEN = "test-management-token";
  try {
    assert.equal(
      canEdit(new Request("https://workspace.vercel.app/api/workspace")),
      false,
    );
    assert.equal(
      canEdit(
        new Request("https://workspace.vercel.app/api/workspace", {
          headers: { "x-workspace-token": "test-management-token" },
        }),
      ),
      true,
    );
  } finally {
    if (prior === undefined) delete process.env.WORKSPACE_ACCESS_TOKEN;
    else process.env.WORKSPACE_ACCESS_TOKEN = prior;
  }
});
