import { z } from "zod";
import {
  AnalysisResultSchema,
  InterviewPhaseSchema,
  NextActionSchema,
  ResumeAnalysisSchema,
  TurnEvaluationSchema,
  type AnalysisResult,
  type InterviewState,
  type ResumeAnalysis,
} from "../shared/schemas.js";
import { callJson } from "./llm.js";

export const OpeningQuestionSchema = z.object({
  content: z.string(),
  competency: z.string(),
});

export const TurnPayloadSchema = z.object({
  interviewerMessage: z.object({
    content: z.string(),
    phase: InterviewPhaseSchema,
    competency: z.string(),
  }),
  turnEvaluation: TurnEvaluationSchema,
  phase: InterviewPhaseSchema,
  planCursor: z.number().int().min(0),
  currentCompetency: z.string(),
  completedCompetencies: z.array(z.string()),
  pendingRiskPoints: z.array(z.string()),
  collectedEvidence: z.array(z.string()),
  canFinishReason: z.string().nullable(),
});

const interviewerSystemPrompt = `
你是一个专业偏强的互联网技术岗面试官。你的目标不是闲聊，而是基于 JD 和简历完成结构化验证。

核心行为规则：
1. 问题必须来自 JD、简历、分析结论或上一轮回答。
2. 候选人回答空泛时，追问具体事实、指标、口径、个人贡献和方案取舍。
3. 候选人回答与简历表述矛盾时，直接指出矛盾并要求解释。
4. 不要一次问太多无关问题；每轮围绕一个主要能力点推进。
5. 只有当前能力点证据充分时，才进入下一阶段。
6. 面试语气专业、克制、有压迫感，但不要羞辱候选人。
`;

export async function analyzeResume(resumeText: string) {
  return callJson(
    "简历结构化分析",
    ResumeAnalysisSchema,
    `${interviewerSystemPrompt}

你现在只分析候选人简历，不结合 JD。目标是把 PDF 解析文本转成招聘同学能直接阅读的候选人画像。`,
    `
请分析下面的简历文本，生成结构化候选人画像。

要求：
- 只基于简历文本，不要编造未出现的信息。
- 重点识别候选人的角色、年限、核心技能、关键项目、个人贡献、模糊表述、风险点和后续追问方向。
- 如果姓名、年限或当前角色不明确，用 null。
- 顶层字段只能是 name、currentRole、yearsExperience、summary、coreSkills、keyProjects、strengths、unclearClaims、risks、suggestedProbeAreas。
- 所有数组字段必须返回数组；没有内容时返回空数组，不要省略字段。

必须严格按这个 JSON 形状输出：
{
  "name": "string or null",
  "currentRole": "string or null",
  "yearsExperience": 0,
  "summary": "string",
  "coreSkills": ["string"],
  "keyProjects": [
    {
      "name": "string",
      "role": "string",
      "technologies": ["string"],
      "evidence": "string"
    }
  ],
  "strengths": ["string"],
  "unclearClaims": ["string"],
  "risks": ["string"],
  "suggestedProbeAreas": ["string"]
}

简历文本:
${resumeText}
`,
  );
}

export async function analyzeInputs(
  jdText: string,
  resumeText: string,
  resumeAnalysis?: ResumeAnalysis,
) {
  return callJson(
    "JD 和简历分析",
    AnalysisResultSchema,
    `${interviewerSystemPrompt}

你现在要做面试前分析。输出必须完整覆盖岗位、候选人、匹配判断和面试计划。`,
    `
请分析下面的 JD 和候选人简历，生成结构化面试准备材料。

要求：
- 面向互联网技术岗。
- match.score 必须是 0-100 的整数或小数。
- interviewPlan 至少覆盖 opening、background_check、project_deep_dive、skill_validation、risk_probe。
- riskToProbe 要来自简历模糊表述、岗位硬要求缺口或经历不一致之处。
- starterQuestion 必须是可直接问候选人的一句话。
- 顶层字段只能是 job、candidate、match、interviewPlan。
- interviewPlan 必须是数组，不能是对象。
- AnalysisResult 里的所有字符串字段必须返回字符串；缺信息时返回“不明”，绝对不要返回 null。
- 所有数组字段即使只有一项也必须返回数组；缺信息时返回空数组，不要省略字段，不要返回 null。

必须严格按这个 JSON 形状输出：
{
  "job": {
    "title": "string",
    "seniority": "string",
    "responsibilities": ["string"],
    "requiredSkills": ["string"],
    "preferredSkills": ["string"],
    "evaluationCriteria": ["string"]
  },
  "candidate": {
    "name": "string",
    "currentRole": "string",
    "yearsExperience": 0,
    "keyProjects": ["string"],
    "skills": ["string"],
    "unclearClaims": ["string"],
    "resumeSignals": ["string"]
  },
  "match": {
    "score": 0,
    "strengths": ["string"],
    "gaps": ["string"],
    "risks": ["string"],
    "focusAreas": ["string"]
  },
  "interviewPlan": [
    {
      "phase": "opening",
      "title": "string",
      "goal": "string",
      "competencies": ["string"],
      "starterQuestion": "string",
      "expectedEvidence": ["string"],
      "riskToProbe": "string"
    }
  ]
}

JD:
${jdText}

简历:
${resumeText}

${resumeAnalysis ? `已完成的简历 AI 分析结果，可作为候选人画像参考，但最终匹配判断仍需结合 JD：\n${JSON.stringify(resumeAnalysis, null, 2)}` : ""}
`,
  );
}

export async function createOpeningQuestion(analysis: AnalysisResult) {
  return callJson(
    "面试开场问题生成",
    OpeningQuestionSchema,
    interviewerSystemPrompt,
    `
根据下面的面试前分析，生成第一句面试官问题。

要求：
- 不要自我介绍太长。
- 第一问应该从候选人最近或最关键项目切入，并明确要求说明背景、个人职责、关键技术选择和结果。
- competency 写本问题正在验证的能力点。
- 顶层字段只能是 content、competency。
- content 和 competency 都必须是字符串，不要省略字段。

必须严格按这个 JSON 形状输出：
{
  "content": "string",
  "competency": "string"
}

分析:
${JSON.stringify(analysis, null, 2)}
`,
  );
}

export async function evaluateTurnAndAskNext(state: InterviewState, answer: string) {
  return callJson(
    "面试追问决策",
    TurnPayloadSchema,
    interviewerSystemPrompt,
    `
你正在进行一场真实技术面试。请基于当前状态和候选人最新回答，先评价回答，再决定下一句面试官问题。

硬性规则：
- 如果候选人说“做过优化”“速度快了不少”“参与架构设计”“负责核心模块”但没有具体指标、个人贡献或技术细节，nextAction 必须是 follow_up、deepen 或 challenge。
- 如果回答缺少量化结果，必须追问指标口径和前后数据。
- 如果无法区分团队贡献和个人贡献，必须追问候选人本人独立完成的部分。
- 如果当前能力点已经有充分证据，可以 move_next 到下一个阶段。
- 只有在至少 6 轮有效问答后，才可以 close_ready。
- interviewerMessage.content 必须是面试官下一轮实际会说的话。
- canFinishReason 只有在你认为可以结束面试时才填写，否则为 null。
- 顶层字段只能是 interviewerMessage、turnEvaluation、phase、planCursor、currentCompetency、completedCompetencies、pendingRiskPoints、collectedEvidence、canFinishReason。
- phase 只能是 opening、background_check、project_deep_dive、skill_validation、risk_probe、closing。
- nextAction 只能是 follow_up、deepen、challenge、move_next、close_ready。
- answerQuality 只能是 strong、acceptable、weak、evasive。
- evidenceLevel 只能是 specific、partial、vague、none。
- followUpReason 必须是字符串；如果没有追问原因，返回空字符串，不要返回 null。
- 所有数组字段必须返回数组；没有内容时返回空数组，不要省略字段。

必须严格按这个 JSON 形状输出：
{
  "interviewerMessage": {
    "content": "string",
    "phase": "opening",
    "competency": "string"
  },
  "turnEvaluation": {
    "answerQuality": "weak",
    "evidenceLevel": "vague",
    "detectedSignals": ["string"],
    "missingSignals": ["string"],
    "contradictions": ["string"],
    "shouldFollowUp": true,
    "followUpReason": "string",
    "nextAction": "follow_up",
    "competency": "string",
    "score": 0
  },
  "phase": "opening",
  "planCursor": 0,
  "currentCompetency": "string",
  "completedCompetencies": ["string"],
  "pendingRiskPoints": ["string"],
  "collectedEvidence": ["string"],
  "canFinishReason": null
}

当前面试状态:
${JSON.stringify(state, null, 2)}

候选人最新回答:
${answer}
`,
  );
}

export const ReportSchema = z.object({
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

export async function createReport(analysis: AnalysisResult, state: InterviewState) {
  return callJson(
    "面试评估报告生成",
    ReportSchema,
    `${interviewerSystemPrompt}

你现在要生成面试评估报告。结论必须引用简历、JD 和面试问答证据，不能泛泛而谈。`,
    `
请根据面试前分析和完整面试状态，生成结构化评估报告。

要求：
- recommendationText 用中文明确说明“建议推进 / 谨慎推进 / 不建议推进”的理由。
- 每个主要风险必须引用候选人回答或简历中的具体证据。
- qaEvidence 必须覆盖关键问答，不要编造没有发生过的回答。
- nextRoundSuggestions 必须是下一轮可执行的验证动作。
- 顶层字段只能是 recommendation、recommendationText、overallScore、scorecard、positiveEvidence、risks、qaEvidence、nextRoundSuggestions。
- recommendation 只能是 advance、advance_with_reservations、reject。
- severity 只能是 low、medium、high。
- 所有数组字段必须返回数组；没有内容时返回空数组，不要省略字段。

必须严格按这个 JSON 形状输出：
{
  "recommendation": "advance_with_reservations",
  "recommendationText": "string",
  "overallScore": 0,
  "scorecard": [
    {
      "dimension": "string",
      "score": 0,
      "evidence": "string"
    }
  ],
  "positiveEvidence": ["string"],
  "risks": [
    {
      "risk": "string",
      "evidence": "string",
      "severity": "medium"
    }
  ],
  "qaEvidence": [
    {
      "question": "string",
      "answerSummary": "string",
      "evaluation": "string"
    }
  ],
  "nextRoundSuggestions": ["string"]
}

面试前分析:
${JSON.stringify(analysis, null, 2)}

面试状态:
${JSON.stringify(state, null, 2)}
`,
  );
}
