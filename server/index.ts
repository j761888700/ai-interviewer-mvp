import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import pdfParse from "pdf-parse";
import {
  AnalyzeRequestSchema,
  InterviewReportSchema,
  InterviewTurnRequestSchema,
  ReportRequestSchema,
  ResumeAnalysisRequestSchema,
  StartInterviewRequestSchema,
  type InterviewMessage,
  type InterviewState,
} from "../shared/schemas.js";
import { ApiError, getSafeLlmConfig } from "./llm.js";
import {
  analyzeInputs,
  analyzeResume,
  createOpeningQuestion,
  createReport,
  evaluateTurnAndAskNext,
} from "./prompts.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const app = express();
const port = Number(process.env.PORT || 8787);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function now() {
  return new Date().toISOString();
}

function normalizeFileName(fileName: string) {
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
  const originalLooksMojibake = /Ã|Â|æ|è|ä|å|ç|±||/.test(fileName);

  if (replacementCount === 0 && (originalLooksMojibake || decoded.endsWith(".pdf"))) {
    return decoded;
  }

  return fileName;
}

function message(
  role: "interviewer" | "candidate",
  content: string,
  phase: InterviewState["phase"],
  competency: string,
): InterviewMessage {
  return {
    role,
    content,
    phase,
    competency,
    timestamp: now(),
  };
}

app.get("/api/health", (_req, res) => {
  const llm = getSafeLlmConfig();
  res.json({
    ok: true,
    llm,
  });
});

app.post(
  "/api/parse-resume-pdf",
  upload.single("resumePdf"),
  asyncHandler(async (req, res) => {
    const file = req.file;

    if (!file) {
      throw new ApiError(400, "missing_pdf", "请上传一份 PDF 简历。");
    }

    const normalizedFileName = normalizeFileName(file.originalname);
    const isPdf =
      file.mimetype === "application/pdf" ||
      normalizedFileName.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      throw new ApiError(400, "invalid_pdf_type", "简历只支持 PDF 文件。");
    }

    const result = await pdfParse(file.buffer);
    const text = result.text
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text.length < 40) {
      throw new ApiError(
        400,
        "empty_pdf_text",
        "这份 PDF 没有解析出足够文本，可能是扫描件或图片版简历。",
      );
    }

    res.json({
      fileName: normalizedFileName,
      text,
      charCount: text.length,
      pageCount: result.numpages ?? null,
    });
  }),
);

app.post(
  "/api/analyze",
  asyncHandler(async (req, res) => {
    const body = AnalyzeRequestSchema.parse(req.body);
    const analysis = await analyzeInputs(body.jdText, body.resumeText, body.resumeAnalysis);
    res.json(analysis);
  }),
);

app.post(
  "/api/analyze-resume",
  asyncHandler(async (req, res) => {
    const body = ResumeAnalysisRequestSchema.parse(req.body);
    const analysis = await analyzeResume(body.resumeText);
    res.json(analysis);
  }),
);

app.post(
  "/api/interview/start",
  asyncHandler(async (req, res) => {
    const body = StartInterviewRequestSchema.parse(req.body);
    const first = await createOpeningQuestion(body.analysis);
    const firstPhase = body.analysis.interviewPlan[0]?.phase || "opening";
    const sessionId = randomUUID();
    const firstQuestion = message("interviewer", first.content, firstPhase, first.competency);
    const state: InterviewState = {
      sessionId,
      phase: firstPhase,
      round: 0,
      planCursor: 0,
      currentCompetency: first.competency,
      completedCompetencies: [],
      pendingRiskPoints: [
        ...body.analysis.match.risks,
        ...body.analysis.candidate.unclearClaims,
      ].slice(0, 8),
      collectedEvidence: [],
      messages: [firstQuestion],
      evaluations: [],
      canFinishReason: null,
      analysisContext: body.analysis,
    };

    res.json({ sessionId, firstQuestion, state });
  }),
);

app.post(
  "/api/interview/turn",
  asyncHandler(async (req, res) => {
    const body = InterviewTurnRequestSchema.parse(req.body);
    if (body.sessionId !== body.state.sessionId) {
      throw new ApiError(400, "session_mismatch", "sessionId 与面试状态不一致。");
    }

    const candidateMessage = message(
      "candidate",
      body.answer,
      body.state.phase,
      body.state.currentCompetency,
    );
    const stateWithAnswer: InterviewState = {
      ...body.state,
      messages: [...body.state.messages, candidateMessage],
    };

    const payload = await evaluateTurnAndAskNext(stateWithAnswer, body.answer);
    const interviewerMessage = message(
      "interviewer",
      payload.interviewerMessage.content,
      payload.interviewerMessage.phase,
      payload.interviewerMessage.competency,
    );

    const nextRound = body.state.round + 1;
    const canFinishReason =
      nextRound >= 6 && payload.canFinishReason ? payload.canFinishReason : null;
    const state: InterviewState = {
      ...body.state,
      phase: payload.phase,
      round: nextRound,
      planCursor: payload.planCursor,
      currentCompetency: payload.currentCompetency,
      completedCompetencies: payload.completedCompetencies,
      pendingRiskPoints: payload.pendingRiskPoints,
      collectedEvidence: payload.collectedEvidence,
      messages: [...body.state.messages, candidateMessage, interviewerMessage],
      evaluations: [...body.state.evaluations, payload.turnEvaluation],
      canFinishReason,
      analysisContext: body.state.analysisContext,
    };

    res.json({
      interviewerMessage,
      turnEvaluation: payload.turnEvaluation,
      state,
      canFinish: Boolean(canFinishReason),
    });
  }),
);

app.post(
  "/api/interview/report",
  asyncHandler(async (req, res) => {
    const body = ReportRequestSchema.parse(req.body);
    const report = await createReport(body.analysis, body.state);
    const validated = InterviewReportSchema.parse(report);
    res.json(validated);
  }),
);

const clientDist = path.resolve(process.cwd(), "dist/client");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error: {
        code: error.code,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "PDF 文件不能超过 8MB。"
            : `PDF 上传失败：${error.message}`,
      },
    });
    return;
  }

  if (error && typeof error === "object" && "issues" in error) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "请求数据不符合接口要求。",
        details: error,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "未知服务器错误。";
  res.status(500).json({ error: { code: "internal_error", message } });
});

app.listen(port, () => {
  console.log(`API server listening on http://127.0.0.1:${port}`);
});
