import test from "node:test";
import assert from "node:assert/strict";
import { buildCommentTree } from "./comments.js";

test("buildCommentTree nests replies to arbitrary depth without a depth cap", () => {
  const comments = [
    {
      id: "c1",
      userId: "u1",
      videoId: "v1",
      parentId: null,
      body: "root",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z")
    },
    {
      id: "c2",
      userId: "u2",
      videoId: "v1",
      parentId: "c1",
      body: "reply1",
      createdAt: new Date("2024-01-01T00:01:00Z"),
      updatedAt: new Date("2024-01-01T00:01:00Z")
    },
    {
      id: "c3",
      userId: "u3",
      videoId: "v1",
      parentId: "c2",
      body: "reply2",
      createdAt: new Date("2024-01-01T00:02:00Z"),
      updatedAt: new Date("2024-01-01T00:02:00Z")
    },
    {
      id: "c4",
      userId: "u4",
      videoId: "v1",
      parentId: "c3",
      body: "reply3",
      createdAt: new Date("2024-01-01T00:03:00Z"),
      updatedAt: new Date("2024-01-01T00:03:00Z")
    }
  ] as const;

  const tree = buildCommentTree(comments as any);
  assert.equal(tree[0].id, "c1");
  assert.equal(tree[0].children[0].id, "c2");
  assert.equal(tree[0].children[0].children[0].id, "c3");
  assert.equal(tree[0].children[0].children[0].children[0].id, "c4");
});

test("buildCommentTree keeps sibling replies grouped under their parent", () => {
  const comments = [
    {
      id: "root",
      userId: "u1",
      videoId: "v1",
      parentId: null,
      body: "root",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z")
    },
    {
      id: "reply-a",
      userId: "u2",
      videoId: "v1",
      parentId: "root",
      body: "a",
      createdAt: new Date("2024-01-01T00:01:00Z"),
      updatedAt: new Date("2024-01-01T00:01:00Z")
    },
    {
      id: "reply-b",
      userId: "u3",
      videoId: "v1",
      parentId: "root",
      body: "b",
      createdAt: new Date("2024-01-01T00:02:00Z"),
      updatedAt: new Date("2024-01-01T00:02:00Z")
    }
  ] as const;

  const tree = buildCommentTree(comments as any);
  assert.equal(tree[0].children.length, 2);
  assert.deepEqual(
    tree[0].children.map((child) => child.id),
    ["reply-a", "reply-b"]
  );
});
