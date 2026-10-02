export type NotificationType =
  | "follow"
  | "comment"
  | "reply"
  | "like"
  | "report"
  | "mention";

export function buildNotificationMessage(
  type: NotificationType,
  actorName: string
): string {
  const name = actorName?.trim() || "Someone";

  switch (type) {
    case "follow":
      return `${name} started following you`;
    case "comment":
      return `${name} commented on your video`;
    case "reply":
      return `${name} replied to your comment`;
    case "like":
      return `${name} liked your video`;
    case "report":
      return `${name} reported content`;
    case "mention":
      return `${name} mentioned you`;
    default:
      return `${name} interacted with you`;
  }
}
