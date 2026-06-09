import { z } from "zod";

export const InterviewPhaseSchema = z.enum([
  "opening",
  "background_check",
  "project_deep_dive",
  "skill_validation",
  "risk_probe",
  "closing",
]);

export const NextActionSchema = z.enum([
  "follow_up",
  "deepen",
  "challenge",
  "move_next",
  "close_ready",
]);

export const AnalysisResultSchema = z.object({
  job: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requiredSkills: z.array(z.string()),
    preferredSkills: z.array(z.string()),
    evaluationCriteria: z.array(z.string()),
  }),
  candidate: z.object({
    name: z.string(),
    currentRole: z.string(),
    yearsExperience: z.number().nullable(),
    keyProjects: z.array(z.string()),
    skills: z.array(z.string()),
    unclearClaims: z.array(z.string()),
    resumeSignals: z.array(z.string()),
  }),
  match: z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
    risks: z.array(z.string()),
    focusAreas: z.array(z.string()),
  }),
  interviewPlan: z.array(
    z.object({
      phase: InterviewPhaseSchema,
      title: z.string(),
      goal: z.string(),
      competencies: z.array(z.string()),
      starterQuestion: z.string(),
      expectedEvidence: z.array(z.string()),
      riskToProbe: z.string(),
    }),
  ),
});

export const ResumeAnalysisSchema = z.object({
  name: z.string().nullable(),
  currentRole: z.string().nullable(),
  yearsExperience: z.number().nullable(),
  summary: z.string(),
  coreSkills: z.array(z.string()),
  keyProjects: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      technologies: z.array(z.string()),
      evidence: z.string(),
    }),
  ),
  strengths: z.array(z.string()),
  unclearClaims: z.array(z.string()),
  risks: z.array(z.string()),
  suggestedProbeAreas: z.array(z.string()),
});

export const ResumeAnalysisRequestSchema = z.object({
  resumeText: z.string().trim().min(40, "简历内容过短，无法进行 AI 分析。"),
});

export const InterviewMessageSchema = z.object({
  role: z.enum(["interviewer", "candidate"]),
  content: z.string(),
  phase: InterviewPhaseSchema,
  competency: z.string(),
  timestamp: z.string(),
});

export const TurnEvaluationSchema = z.object({
  answerQuality: z.enum(["strong", "acceptable", "weak", "evasive"]),
  evidenceLevel: z.enum(["specific", "partial", "vague", "none"]),
  detectedSignals: z.array(z.string()),
  missingSignals: z.array(z.string()),
  contradictions: z.array(z.string()),
  shouldFollowUp: z.boolean(),
  followUpReason: z.string().nullable().transform((value) => value ?? ""),
  nextAction: NextActionSchema,
  competency: z.string(),
  score: z.number().min(0).max(100),
});

export const InterviewStateSchema = z.object({
  sessionId: z.string(),
  phase: InterviewPhaseSchema,
  round: z.number().int().min(0),
  planCursor: z.number().int().min(0),
  currentCompetency: z.string(),
  completedCompetencies: z.array(z.string()),
  pendingRiskPoints: z.array(z.string()),
  collectedEvidence: z.array(z.string()),
  messages: z.array(InterviewMessageSchema),
  evaluations: z.array(TurnEvaluationSchema),
  canFinishReason: z.string().nullable(),
  analysisContext: AnalysisResultSchema,
});

export const AnalyzeRequestSchema = z.object({
  jdText: z.string().trim().min(40, "JD 内容过短，无法形成有效面试计划。"),
  resumeText: z.string().trim().min(40, "简历内容过短，无法形成有效面试计划。"),
  resumeAnalysis: ResumeAnalysisSchema.optional(),
});

export const StartInterviewRequestSchema = z.object({
  analysis: AnalysisResultSchema,
});

export const StartInterviewResponseSchema = z.object({
  sessionId: z.string(),
  firstQuestion: InterviewMessageSchema,
  state: InterviewStateSchema,
});

export const InterviewTurnRequestSchema = z.object({
  sessionId: z.string(),
  answer: z.string().trim().min(2, "回答过短，无法判断候选人能力。"),
  state: InterviewStateSchema,
});

export const InterviewTurnResponseSchema = z.object({
  interviewerMessage: InterviewMessageSchema,
  turnEvaluation: TurnEvaluationSchema,
  state: InterviewStateSchema,
  canFinish: z.boolean(),
});

export const ReportRequestSchema = z.object({
  analysis: AnalysisResultSchema,
  state: InterviewStateSchema,
});

export const InterviewReportSchema = z.object({
  recommendation: z.enum(["advance", "advance_with_reservations", "reject"]),
  recommendationText: z.string(),
  overallScore: z.number().min(0).max(100),
  scorecard: z.array(
    z.object({
      dimension: z.string(),
      score: z.number().min(0).max(100),
      evidence: z.string(),
    }),
  ),
  positiveEvidence: z.array(z.string()),
  risks: z.array(
    z.object({
      risk: z.string(),
      evidence: z.string(),
      severity: z.enum(["low", "medium", "high"]),
    }),
  ),
  qaEvidence: z.array(
    z.object({
      question: z.string(),
      answerSummary: z.string(),
      evaluation: z.string(),
    }),
  ),
  nextRoundSuggestions: z.array(z.string()),
});

export type InterviewPhase = z.infer<typeof InterviewPhaseSchema>;
export type NextAction = z.infer<typeof NextActionSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type ResumeAnalysis = z.infer<typeof ResumeAnalysisSchema>;
export type InterviewMessage = z.infer<typeof InterviewMessageSchema>;
export type TurnEvaluation = z.infer<typeof TurnEvaluationSchema>;
export type InterviewState = z.infer<typeof InterviewStateSchema>;
export type InterviewReport = z.infer<typeof InterviewReportSchema>;
