export type CommentRow = {
  id: string;
  userId: string;
  videoId: string;
  parentId: string | null;
  body: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type CommentNode = CommentRow & {
  children: CommentNode[];
};

export function buildCommentTree(comments: CommentRow[]): CommentNode[] {
  const sorted = [...comments].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return aTime - bTime;
  });

  const nodes = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const comment of sorted) {
    const node: CommentNode = {
      ...comment,
      createdAt: new Date(comment.createdAt),
      updatedAt: new Date(comment.updatedAt),
      children: []
    };

    nodes.set(comment.id, node);
  }

  for (const comment of sorted) {
    const node = nodes.get(comment.id);

    if (!node) {
      continue;
    }

    if (comment.parentId && nodes.has(comment.parentId)) {
      nodes.get(comment.parentId)?.children.push(node);
      continue;
    }

    roots.push(node);
  }

  return roots;
}
