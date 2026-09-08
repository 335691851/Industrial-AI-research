import test from "node:test";
import assert from "node:assert/strict";
import { publicError } from "../src/server/security";

test("nested network errors are actionable without exposing raw secrets", () => {
  const cause = Object.assign(new Error("Bearer private-fixture-secret"), { code: "EACCES" });
  const message = publicError(new TypeError("fetch failed", { cause }));
  assert.match(message, /网络访问被系统权限限制/);
  assert.equal(message.includes("private-fixture-secret"), false);
  assert.match(publicError(Object.assign(new Error("hidden"), { code: "ENOTFOUND" })), /域名解析失败/);
  assert.match(publicError(new DOMException("hidden", "TimeoutError")), /超时/);
});
