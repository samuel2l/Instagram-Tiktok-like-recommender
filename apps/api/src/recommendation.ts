export type RecommendationCandidateSource =
  | "fresh"
  | "followed"
  | "similar"
  | "topic"
  | "exploration";

export type RecommendationCandidate = {
  candidateSource: RecommendationCandidateSource;
  freshnessHours: number;
  creatorAffinity: number;
  topicAffinity: number;
  completionRate: number;
  engagementQuality: number;
  negativeFeedbackPenalty: number;
  seenPenalty: number;
};

export function scoreRecommendationCandidate(
  candidate: RecommendationCandidate
): number {
  let score = 0;

  score += candidate.creatorAffinity * 35;
  score += candidate.topicAffinity * 28;
  score += candidate.engagementQuality * 18;
  score += candidate.completionRate * 32;

  const freshnessBoost = Math.max(
    0,
    24 - Math.log1p(Math.max(0, candidate.freshnessHours)) * 6
  );

  score +=
    freshnessBoost *
    (candidate.candidateSource === "fresh"
      ? 1.2
      : candidate.candidateSource === "followed"
        ? 0.9
        : 0.5);

  if (candidate.candidateSource === "followed") {
    score += 18;
  }

  if (candidate.candidateSource === "similar") {
    score += 20;
  }

  if (candidate.candidateSource === "topic") {
    score += 12;
  }

  if (candidate.candidateSource === "exploration") {
    score += 8;
  }

  score -= candidate.negativeFeedbackPenalty;
  score -= candidate.seenPenalty;

  return score;
}
