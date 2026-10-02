import test from "node:test";
import assert from "node:assert/strict";
import { scoreRecommendationCandidate } from "./recommendation.js";

test("strong positive engagement and topic affinity outrank a plain recent video", () => {
  const freshOnly = scoreRecommendationCandidate({
    candidateSource: "fresh",
    freshnessHours: 2,
    creatorAffinity: 0,
    topicAffinity: 0,
    completionRate: 0.1,
    engagementQuality: 0.2,
    negativeFeedbackPenalty: 0,
    seenPenalty: 0
  });

  const relevantVideo = scoreRecommendationCandidate({
    candidateSource: "similar",
    freshnessHours: 18,
    creatorAffinity: 0.75,
    topicAffinity: 0.9,
    completionRate: 0.8,
    engagementQuality: 0.85,
    negativeFeedbackPenalty: 0,
    seenPenalty: 0
  });

  assert.ok(relevantVideo > freshOnly);
});

test("not interested and negative creator signals heavily reduce score", () => {
  const normalScore = scoreRecommendationCandidate({
    candidateSource: "exploration",
    freshnessHours: 8,
    creatorAffinity: 0.2,
    topicAffinity: 0.5,
    completionRate: 0.4,
    engagementQuality: 0.45,
    negativeFeedbackPenalty: 0,
    seenPenalty: 0
  });

  const punishedScore = scoreRecommendationCandidate({
    candidateSource: "exploration",
    freshnessHours: 8,
    creatorAffinity: 0.2,
    topicAffinity: 0.5,
    completionRate: 0.4,
    engagementQuality: 0.45,
    negativeFeedbackPenalty: 80,
    seenPenalty: 20
  });

  assert.ok(punishedScore < normalScore);
});
