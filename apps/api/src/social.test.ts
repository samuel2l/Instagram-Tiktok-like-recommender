import test from "node:test";
import assert from "node:assert/strict";
import { buildNotificationMessage } from "./social.js";

test("follow notification message is user-friendly", () => {
  assert.equal(buildNotificationMessage("follow", "alice"), "alice started following you");
});

test("comment notification message includes the actor name", () => {
  assert.equal(buildNotificationMessage("comment", "alice"), "alice commented on your video");
});
