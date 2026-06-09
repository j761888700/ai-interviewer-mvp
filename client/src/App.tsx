import {
  ArrowRight,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FileCheck2,
  Loader2,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  StopCircle,
  UploadCloud,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import type {
  AnalysisResult,
  InterviewReport,
  InterviewState,
  InterviewTurnResponseSchema,
  ResumeAnalysis,
} from "../../shared/schemas";
import type { z } from "zod";

type Screen = "input" | "analyzing" | "ready" | "interview" | "report";
type TurnResponse = z.infer<typeof InterviewTurnResponseSchema>;

const analysisSteps = [
  "解析岗位职责",
  "抽取能力要求",
  "解析候选人经历",
  "识别匹配点",
  "识别风险点",
  "生成面试计划",
];

const phaseLabels: Record<InterviewState["phase"], string> = {
  opening: "开场校准",
  background_check: "背景确认",
  project_deep_dive: "项目深挖",
  skill_validation: "技能验证",
  risk_probe: "风险追问",
  closing: "收尾判断",
};

const recommendationLabels: Record<InterviewReport["recommendation"], string> = {
  advance: "建议推进",
  advance_with_reservations: "谨慎推进",
  reject: "不建议推进",
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || "请求失败，请稍后重试。";
    throw new Error(message);
  }

  return payload as T;
}

async function postForm<T>(url: string, body: FormData): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    body,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || "请求失败，请稍后重试。";
    throw new Error(message);
  }

  return payload as T;
}

function sampleJd() {
  return `岗位：高级前端工程师

职责：
1. 负责招聘管理 SaaS 产品的核心前端模块设计与开发；
2. 推动复杂表格、流程配置、候选人详情等高交互页面的性能优化；
3. 与后端、产品、设计协作，拆解需求并保证交付质量；
4. 参与前端工程化建设，包括组件复用、状态管理、构建优化和代码规范。

要求：
1. 4 年以上前端开发经验，熟悉 React、TypeScript、Vite；
2. 有复杂后台系统或 B 端 SaaS 项目经验；
3. 熟悉性能优化，能用指标定位问题并解释优化前后变化；
4. 能独立负责模块，有跨团队沟通和方案设计能力；
5. 加分项：熟悉表格虚拟滚动、权限控制、数据可视化。`;
}

function sampleResume() {
  return `候选人：陈明
当前职位：前端工程师，5 年经验

经历：
2022-至今，某电商平台，前端工程师。
- 负责商家后台订单、商品、库存模块开发；
- 主导过后台性能优化，页面速度提升明显；
- 使用 React、TypeScript、Vite、Zustand；
- 参与组件库建设，封装表格、筛选器、弹窗等组件。

项目：
1. 商家订单工作台：支持订单筛选、批量操作、售后状态跟踪。本人负责前端页面开发和部分状态管理。
2. 商品编辑器：负责复杂表单、图片上传、规格联动。
3. 性能优化项目：通过代码拆分、图片压缩、接口合并等方式提升加载速度。

教育：本科，计算机科学与技术。`;
}

function App() {
  const [screen, setScreen] = useState<Screen>("input");
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(null);
  const [resumeFileName, setResumeFileName] = useState("");
  const [resumeParseStatus, setResumeParseStatus] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [interviewState, setInterviewState] = useState<InterviewState | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [progressIndex, setProgressIndex] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState("");

  const canAnalyze =
    jdText.trim().length >= 40 && resumeText.trim().length >= 40 && Boolean(resumeAnalysis);
  const currentEvaluation = interviewState?.evaluations.at(-1);
  const messages = interviewState?.messages || [];
  const sourceReadOnly = screen !== "input";

  const progressText = useMemo(() => {
    if (screen !== "analyzing") return "";
    if (progressIndex >= analysisSteps.length) return "分析完成";
    return analysisSteps[progressIndex];
  }, [progressIndex, screen]);

  async function handleAnalyze() {
    if (!canAnalyze) {
      setError("需要先填写 JD，并上传 PDF 简历完成 AI 简历分析，才能生成面试计划。");
      return;
    }

    setError("");
    setScreen("analyzing");
    setProgressIndex(0);
    setLoadingLabel("正在调用大模型分析 JD 和 PDF 简历");

    const timer = window.setInterval(() => {
      setProgressIndex((value) => Math.min(value + 1, analysisSteps.length - 1));
    }, 900);

    try {
      const result = await postJson<AnalysisResult>("/api/analyze", {
        jdText,
        resumeText,
        resumeAnalysis,
      });
      window.clearInterval(timer);
      setProgressIndex(analysisSteps.length);
      setAnalysis(result);
      window.setTimeout(() => {
        setScreen("ready");
        setLoadingLabel("");
      }, 450);
    } catch (err) {
      window.clearInterval(timer);
      setError(err instanceof Error ? err.message : "分析失败。");
      setScreen("input");
      setLoadingLabel("");
    }
  }

  async function handleResumePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setError("简历只支持 PDF 文件。");
      return;
    }

    setError("");
    setResumeText("");
    setResumeAnalysis(null);
    setResumeFileName(file.name);
    setResumeParseStatus("正在解析 PDF 简历...");
    setLoadingLabel("正在解析 PDF 简历");

    const formData = new FormData();
    formData.append("resumePdf", file);

    try {
      const result = await postForm<{
        fileName: string;
        text: string;
        charCount: number;
        pageCount: number | null;
      }>("/api/parse-resume-pdf", formData);
      setResumeText(result.text);
      setResumeFileName(file.name || result.fileName);
      setResumeParseStatus(
        `PDF 已解析 ${result.charCount} 字${result.pageCount ? ` / ${result.pageCount} 页` : ""}，正在进行 AI 简历分析...`,
      );
      setLoadingLabel("正在进行 AI 简历分析");

      const aiResume = await postJson<ResumeAnalysis>("/api/analyze-resume", {
        resumeText: result.text,
      });
      setResumeAnalysis(aiResume);
      setResumeParseStatus("AI 简历分析完成");
    } catch (err) {
      setResumeText("");
      setResumeAnalysis(null);
      setResumeParseStatus("处理失败");
      setError(err instanceof Error ? err.message : "PDF 简历解析失败。");
    } finally {
      setLoadingLabel("");
    }
  }

  async function handleStartInterview() {
    if (!analysis) return;
    setError("");
    setLoadingLabel("正在初始化面试官");

    try {
      const result = await postJson<{
        sessionId: string;
        state: InterviewState;
      }>("/api/interview/start", { analysis });
      setInterviewState(result.state);
      setScreen("interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "初始化面试失败。");
    } finally {
      setLoadingLabel("");
    }
  }

  async function handleSendAnswer() {
    if (!interviewState || !answer.trim()) return;
    const answerToSend = answer.trim();
    setAnswer("");
    setError("");
    setLoadingLabel("面试官正在判断是否追问");

    try {
      const result = await postJson<TurnResponse>("/api/interview/turn", {
        sessionId: interviewState.sessionId,
        answer: answerToSend,
        state: interviewState,
      });
      setInterviewState(result.state);
    } catch (err) {
      setAnswer(answerToSend);
      setError(err instanceof Error ? err.message : "面试追问失败。");
    } finally {
      setLoadingLabel("");
    }
  }

  async function handleCreateReport() {
    if (!analysis || !interviewState) return;
    setError("");
    setLoadingLabel("正在生成评估报告");

    try {
      const result = await postJson<InterviewReport>("/api/interview/report", {
        analysis,
        state: interviewState,
      });
      setReport(result);
      setScreen("report");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成报告失败。");
    } finally {
      setLoadingLabel("");
    }
  }

  function resetAll() {
    setScreen("input");
    setAnalysis(null);
    setInterviewState(null);
    setReport(null);
    setAnswer("");
    setError("");
    setResumeAnalysis(null);
    setResumeFileName("");
    setResumeParseStatus("");
    setProgressIndex(0);
    setLoadingLabel("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Recruiting Interviewer</p>
          <h1>智能招聘面试官 MVP</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => {
            setJdText(sampleJd());
            setResumeText(sampleResume());
            setResumeAnalysis({
              name: "陈明",
              currentRole: "前端工程师",
              yearsExperience: 5,
              summary:
                "候选人有 5 年前端经验，主要经历集中在电商后台、复杂表单、组件库和性能优化相关工作。",
              coreSkills: ["React", "TypeScript", "Vite", "Zustand", "后台系统开发"],
              keyProjects: [
                {
                  name: "商家订单工作台",
                  role: "负责前端页面开发和部分状态管理",
                  technologies: ["React", "TypeScript", "Zustand"],
                  evidence: "简历提到支持订单筛选、批量操作、售后状态跟踪。",
                },
                {
                  name: "后台性能优化项目",
                  role: "简历写主导性能优化，但指标和个人贡献不够清晰",
                  technologies: ["代码拆分", "图片压缩", "接口合并"],
                  evidence: "简历表述为“页面速度提升明显”，缺少优化前后数据。",
                },
              ],
              strengths: ["有 B 端/后台系统经验", "技术栈与岗位要求接近", "有组件库参与经历"],
              unclearClaims: ["“主导后台性能优化”缺少具体指标和职责边界"],
              risks: ["性能优化结果没有量化口径", "个人贡献和团队贡献需要面试追问"],
              suggestedProbeAreas: ["性能优化指标", "个人负责范围", "复杂表格/表单设计能力"],
            });
            setResumeFileName("样例简历（AI 分析）");
            setResumeParseStatus("已填入样例 AI 分析结果");
            setError("");
          }}>
            <FileText size={16} />
            填入样例
          </button>
          <button className="ghost-button" onClick={resetAll}>
            <RotateCcw size={16} />
            重置
          </button>
        </div>
      </header>

      {error ? (
        <section className="error-banner">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </section>
      ) : null}

      {screen !== "report" ? (
        <section className="workbench-layout">
          <aside className="source-stack">
            <article className="source-panel">
              <div className="section-heading">
                <FileText size={18} />
                <div>
                  <h2>JD</h2>
                  <p>岗位职责、任职要求、加分项。</p>
                </div>
              </div>
              <textarea
                value={jdText}
                onChange={(event) => setJdText(event.target.value)}
                placeholder="粘贴 JD 文本..."
                readOnly={sourceReadOnly}
              />
            </article>

            <article className="source-panel resume-source">
              <div className="section-heading">
                <ClipboardCheck size={18} />
                <div>
                  <h2>简历</h2>
                  <p>上传候选人的 PDF 简历。</p>
                </div>
              </div>
              <label className={`upload-zone ${sourceReadOnly ? "disabled" : ""}`}>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleResumePdfUpload}
                  disabled={sourceReadOnly || Boolean(loadingLabel)}
                />
                {resumeAnalysis ? <FileCheck2 size={20} /> : <UploadCloud size={20} />}
                <strong>{resumeFileName || "上传 PDF 简历"}</strong>
                <span>{resumeParseStatus || "支持可复制文本的 PDF，最大 8MB"}</span>
              </label>
              {resumeAnalysis ? (
                <div className="resume-analysis-card">
                  <div className="resume-candidate">
                    <strong>{resumeAnalysis.name || "姓名不明"}</strong>
                    <span>
                      {resumeAnalysis.currentRole || "当前角色不明"} ·{" "}
                      {resumeAnalysis.yearsExperience ?? "年限不明"} 年经验
                    </span>
                  </div>
                  <p>{resumeAnalysis.summary}</p>

                  <div className="resume-analysis-section">
                    <h3>核心技能</h3>
                    <div className="tag-list">
                      {resumeAnalysis.coreSkills.slice(0, 8).map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>

                  <div className="resume-analysis-section">
                    <h3>关键项目</h3>
                    <ul>
                      {resumeAnalysis.keyProjects.slice(0, 3).map((project) => (
                        <li key={`${project.name}-${project.role}`}>
                          <strong>{project.name}</strong>
                          <span>{project.role}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="resume-analysis-section">
                    <h3>风险与追问点</h3>
                    <ul>
                      {[...resumeAnalysis.risks, ...resumeAnalysis.unclearClaims]
                        .slice(0, 4)
                        .map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="resume-empty-preview">
                  上传 PDF 后，系统会先解析文本，再调用大模型生成候选人画像、核心技能、关键项目和风险追问点。
                </div>
              )}
            </article>
          </aside>

          <section className="conversation-panel">
            {screen === "input" ? (
              <>
                <div className="chat-header">
                  <div>
                    <p className="eyebrow">Interview Console</p>
                    <h2>面试对话框</h2>
                  </div>
                  <button className="primary-button" disabled={!canAnalyze || Boolean(loadingLabel)} onClick={handleAnalyze}>
                    <Brain size={18} />
                    开始分析
                    <ArrowRight size={18} />
                  </button>
                </div>
                <div className="messages empty-chat">
                  <div className="message interviewer">
                    <span>AI 面试官</span>
                    <p>
                      左侧粘贴 JD 并上传 PDF 简历后，我会先分析岗位要求和候选人画像，再生成面试策略。点击“开始分析”后，这里会进入面试官简报和正式对话。
                    </p>
                  </div>
                </div>
              </>
            ) : null}

            {screen === "analyzing" ? (
              <div className="conversation-progress">
                <div className="chat-header">
                  <div>
                    <p className="eyebrow">Analysis</p>
                    <h2>{progressText}</h2>
                  </div>
                  <Loader2 className="spin-icon" size={22} />
                </div>
                <p className="summary-copy">{loadingLabel}</p>
                <div className="progress-list">
                  {analysisSteps.map((step, index) => {
                    const done = index < progressIndex;
                    const active = index === progressIndex && progressIndex < analysisSteps.length;
                    return (
                      <div className={`progress-row ${done ? "done" : ""} ${active ? "active" : ""}`} key={step}>
                        <span>{done ? <CheckCircle2 size={17} /> : index + 1}</span>
                        <strong>{step}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {screen === "ready" && analysis ? (
              <div className="briefing-panel">
                <div className="chat-header">
                  <div>
                    <p className="eyebrow">面试官简报</p>
                    <h2>{analysis.job.title || "未识别岗位"}</h2>
                  </div>
                  <button className="primary-button" disabled={Boolean(loadingLabel)} onClick={handleStartInterview}>
                    <Play size={18} />
                    开始面试
                  </button>
                </div>

                <div className="briefing-body">
                  <div className="briefing-score">
                    <span>{Math.round(analysis.match.score)}</span>
                    <p>匹配初判</p>
                    <strong>
                      {analysis.candidate.name || "未识别姓名"} ·{" "}
                      {analysis.candidate.currentRole || "当前角色不明"} ·{" "}
                      {analysis.candidate.yearsExperience ?? "年限不明"} 年经验
                    </strong>
                  </div>

                  <div className="briefing-grid">
                    <article>
                      <h3>重点考察方向</h3>
                      <ul>
                        {analysis.match.focusAreas.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                    <article>
                      <h3>简历风险点</h3>
                      <ul>
                        {[...analysis.match.risks, ...analysis.candidate.unclearClaims].slice(0, 6).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                  </div>

                  <article className="briefing-plan">
                    <h3>建议面试结构</h3>
                    <div className="plan-grid">
                      {analysis.interviewPlan.map((section) => (
                        <div className="plan-item" key={`${section.phase}-${section.title}`}>
                          <span>{phaseLabels[section.phase]}</span>
                          <strong>{section.title}</strong>
                          <p>{section.goal}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </div>
            ) : null}

            {screen === "interview" && interviewState ? (
              <div className="interview-console">
                <div className="chat-header">
                  <div>
                    <p className="eyebrow">Interview Room</p>
                    <h2>第 {interviewState.round + 1} 轮</h2>
                  </div>
                  <button className="danger-button" disabled={Boolean(loadingLabel)} onClick={handleCreateReport}>
                    <StopCircle size={17} />
                    结束并生成报告
                  </button>
                </div>

                <div className="status-strip">
                  <div>
                    <span>阶段</span>
                    <strong>{phaseLabels[interviewState.phase]}</strong>
                  </div>
                  <div>
                    <span>考察</span>
                    <strong>{interviewState.currentCompetency}</strong>
                  </div>
                  <div>
                    <span>证据</span>
                    <strong>{currentEvaluation ? `${currentEvaluation.score}/100` : "待判断"}</strong>
                  </div>
                  <div>
                    <span>动作</span>
                    <strong>{currentEvaluation?.nextAction || "尚未回答"}</strong>
                  </div>
                </div>

                <div className="messages">
                  {messages.map((item, index) => (
                    <div className={`message ${item.role}`} key={`${item.timestamp}-${index}`}>
                      <span>{item.role === "interviewer" ? "AI 面试官" : "候选人"}</span>
                      <p>{item.content}</p>
                    </div>
                  ))}
                  {loadingLabel ? (
                    <div className="message interviewer thinking">
                      <span>AI 面试官</span>
                      <p><Loader2 size={15} /> {loadingLabel}</p>
                    </div>
                  ) : null}
                </div>

                <div className="answer-box">
                  <textarea
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="输入你的回答..."
                    disabled={Boolean(loadingLabel)}
                  />
                  <button className="primary-button icon-button" disabled={!answer.trim() || Boolean(loadingLabel)} onClick={handleSendAnswer}>
                    <Send size={18} />
                    发送
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      {screen === "report" && report ? (
        <section className="report-layout">
          <article className="report-hero">
            <p className="eyebrow">Interview Report</p>
            <h2>{recommendationLabels[report.recommendation]}</h2>
            <div className="score-line">
              <span>{Math.round(report.overallScore)}</span>
              <p>综合评分</p>
            </div>
            <p>{report.recommendationText}</p>
          </article>

          <article className="summary-panel wide">
            <h3>分项评分</h3>
            <div className="scorecard-grid">
              {report.scorecard.map((item) => (
                <div className="scorecard-item" key={item.dimension}>
                  <strong>{item.dimension}</strong>
                  <span>{Math.round(item.score)}</span>
                  <p>{item.evidence}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="summary-panel">
            <h3>关键正向证据</h3>
            <ul>
              {report.positiveEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="summary-panel">
            <h3>主要风险</h3>
            <ul>
              {report.risks.map((item) => (
                <li key={item.risk}>
                  <strong>{item.severity.toUpperCase()}</strong> {item.risk}：{item.evidence}
                </li>
              ))}
            </ul>
          </article>

          <article className="summary-panel wide">
            <h3>问答证据摘要</h3>
            <div className="qa-list">
              {report.qaEvidence.map((item) => (
                <div className="qa-item" key={item.question}>
                  <strong>{item.question}</strong>
                  <p>{item.answerSummary}</p>
                  <span>{item.evaluation}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="summary-panel wide">
            <h3>下一轮建议</h3>
            <ul>
              {report.nextRoundSuggestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}
    </main>
  );
}

export default App;
