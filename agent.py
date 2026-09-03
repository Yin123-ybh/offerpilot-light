"""Lightweight local interview agent. No cloud state or server-side API keys are stored."""
from __future__ import annotations
import base64, json, os, re, sqlite3, time
from pathlib import Path
from typing import Any
import fitz
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DB = ROOT / "data.sqlite3"
PUBLIC = ROOT / "public"
app = FastAPI(title="OfferPilot Light Agent")
app.mount("/assets", StaticFiles(directory=PUBLIC / "assets"), name="assets")

def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, role TEXT, questions TEXT, answers TEXT, created_at TEXT, resume_text TEXT, report TEXT, finalized INTEGER DEFAULT 0)")
    try: conn.execute("ALTER TABLE sessions ADD COLUMN report TEXT")
    except sqlite3.OperationalError: pass
    added_finalized = False
    try:
        conn.execute("ALTER TABLE sessions ADD COLUMN finalized INTEGER DEFAULT 0")
        added_finalized = True
    except sqlite3.OperationalError: pass
    if added_finalized:
        # Preserve the visibility of training sets completed before finalization existed.
        for row in conn.execute("SELECT id, questions, answers FROM sessions").fetchall():
            questions, answers = json.loads(row[1]), json.loads(row[2])
            scored = [item for item in answers if item.get("feedback", {}).get("score") is not None]
            if questions and len(scored) >= len(questions):
                conn.execute("UPDATE sessions SET finalized=1 WHERE id=?", (row[0],))
        conn.commit()
    return conn

def parse_json(text: str) -> dict[str, Any]:
    text = text.strip().replace("```json", "").replace("```", "")
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start: raise ValueError("模型没有返回有效 JSON。")
    return json.loads(text[start:end + 1])

async def call_model(key: str, base: str, model: str, messages: list[dict[str, str]], json_mode: bool = True) -> str:
    if not key or not base or not model: raise ValueError("请先填写 API Key、服务地址和模型名称。")
    payload = {"model": model, "temperature": .3, "messages": messages}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(base.rstrip("/") + "/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=payload)
    if response.status_code >= 400:
        try: detail = response.json().get("error", {}).get("message") or response.text
        except ValueError: detail = response.text
        status = response.status_code
        if status == 401:
            raise ValueError(f"认证失败（HTTP 401）：当前 API Key 不属于该服务地址，或已失效。服务返回：{detail[:240]}")
        if status == 404 or "model" in str(detail).lower():
            raise ValueError(f"模型不可用（HTTP {status}）：请确认模型名称与当前账号权限。服务返回：{detail[:240]}")
        if status == 429:
            raise ValueError(f"请求受限或额度不足（HTTP 429）。服务返回：{detail[:240]}")
        raise ValueError(f"模型服务请求失败（HTTP {status}）。服务返回：{detail[:240]}")
    try: return response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    except ValueError as error: raise ValueError("模型响应不是兼容的 OpenAI Chat Completions 格式。") from error

class Config(BaseModel):
    apiKey: str = ""; baseUrl: str = ""; model: str = ""

class Generate(Config):
    role: str = "技术岗位"; description: str = ""; jobDescription: str = ""; resumeText: str = ""; questionCount: int = 15

class Evaluate(Config):
    sessionId: int | None = None; question: dict[str, Any]; answer: str

class VoiceTurn(Config):
    role: str = "技术岗位"; resumeText: str = ""; history: list[dict[str, str]] = Field(default_factory=list); answer: str = ""

class VoiceFinish(Config):
    role: str = "技术岗位"; history: list[dict[str, str]] = Field(default_factory=list)

class InterviewAgent:
    async def generate(self, x: Generate):
        raw = await call_model(x.apiKey, x.baseUrl, x.model, [{"role":"system","content":"你是严谨、简历驱动的中文技术面试官，只输出 JSON。"},{"role":"user","content":f"目标岗位：{x.role}\n岗位描述：{x.description or x.jobDescription}\n简历内容（只可使用其中明确出现的经历、项目、技术或职责）：{x.resumeText[:24000]}\n生成{x.questionCount}道题，覆盖基础八股、项目/实习深挖、业务场景、系统设计、反问。每题必须返回 section、tag、difficulty、question、reference、rubric 数组、resumeEvidence。resumeEvidence 是 20-80 字的具体简历依据：项目题必须点名对应项目或技术事实；通用八股题写“岗位要求：...”或“简历技术栈：...”，不能留空、更不能虚构。格式：{{\"questions\":[...]}}"}])
        questions = [q for q in parse_json(raw).get("questions", []) if q.get("question")]
        if not questions: raise ValueError("模型没有返回有效题目。")
        sid = int(time.time() * 1000); conn = db(); conn.execute("INSERT INTO sessions (id,role,questions,answers,created_at,resume_text,report,finalized) VALUES (?,?,?,?,?,?,?,?)", (sid, x.role, json.dumps(questions, ensure_ascii=False), "[]", time.strftime("%Y-%m-%dT%H:%M:%S"), x.resumeText[:24000], None, 0)); conn.commit(); conn.close()
        return {"questions": questions, "session": {"id": sid, "role": x.role, "trackName": x.role, "questions": questions, "answers": [], "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "status": "in_progress", "questionCount": len(questions), "answeredCount": 0}}

    async def evaluate(self, x: Evaluate):
        q = x.question; raw = await call_model(x.apiKey, x.baseUrl, x.model, [{"role":"system","content":"你是客观、精炼的中文技术面试官，只输出 JSON。"},{"role":"user","content":f"题目：{q.get('question')}\n参考答案：{q.get('reference','')}\n候选人回答：{x.answer}\n只输出：{{\"score\":0-100,\"summary\":\"不超过80字\",\"strengths\":[\"最多2条\"],\"improvements\":[\"最多2条\"],\"followUp\":\"一个追问\"}}"}]); feedback = parse_json(raw)
        if x.sessionId:
            conn = db(); row = conn.execute("SELECT answers FROM sessions WHERE id=?", (x.sessionId,)).fetchone(); answers = json.loads(row[0]) if row else []; answers = [a for a in answers if a.get("question") != q.get("question")]; answers.append({"question": q.get("question"), "answer": x.answer, "feedback": feedback}); conn.execute("UPDATE sessions SET answers=? WHERE id=?", (json.dumps(answers, ensure_ascii=False), x.sessionId)); conn.commit(); conn.close()
        return {"feedback": feedback}

    async def voice_start(self, x: VoiceTurn):
        raw = await call_model(x.apiKey, x.baseUrl, x.model, [{"role":"system","content":"你是专业、克制的中文技术面试官，只输出 JSON。"},{"role":"user","content":f"候选人目标岗位：{x.role}\n候选人简历：{x.resumeText[:16000]}\n开始语音模拟面试，结合简历提出第一个具体问题。只输出：{{\"opening\":\"开场和问题\",\"focus\":\"考察重点\"}}"}]); return parse_json(raw)

    async def voice_turn(self, x: VoiceTurn):
        history = "\n".join(("候选人" if h.get("role") == "candidate" else "面试官") + "：" + h.get("content", "") for h in x.history[-8:]); raw = await call_model(x.apiKey, x.baseUrl, x.model, [{"role":"system","content":"你是严格但有礼貌的中文技术面试官，只输出 JSON。"},{"role":"user","content":f"岗位：{x.role}\n对话：\n{history}\n候选人刚刚回答：{x.answer}\n简短评价并提出递进追问。只输出：{{\"interviewerMessage\":\"评价加追问，不超过180字\",\"focus\":\"下一题考察重点\"}}"}]); return parse_json(raw)

    async def voice_finish(self, x: VoiceFinish):
        history = "\n".join(("候选人" if h.get("role") == "candidate" else "面试官") + "：" + h.get("content", "") for h in x.history[-16:]); raw = await call_model(x.apiKey, x.baseUrl, x.model, [{"role":"system","content":"你是严谨、客观的中文技术面试官，只输出 JSON。"},{"role":"user","content":f"评估这场{x.role}语音模拟面试。对话：\n{history}\n只输出：{{\"score\":0-100,\"summary\":\"不超过100字\",\"strengths\":[\"最多3条\"],\"improvements\":[\"最多3条\"],\"nextStep\":\"下一次练习建议\"}}"}]); return parse_json(raw)

agent = InterviewAgent()
@app.post("/api/resume/extract")
async def extract(payload: dict[str, Any]):
    try:
        raw = base64.b64decode(re.sub(r"^data:application/pdf;base64,", "", str(payload.get("base64", "")), flags=re.I)); doc = fitz.open(stream=raw, filetype="pdf"); text = "\n".join(page.get_text() for page in doc).strip()[:24000]
        return {"text": text or "这是一份扫描型 PDF，未提取到可复制文字。请基于岗位信息提问，不要编造简历经历。", "fileName": payload.get("fileName", "resume.pdf"), "documentId": str(int(time.time()))}
    except Exception as e: raise HTTPException(400, f"简历解析失败：{e}")

@app.post("/api/interviews/generate")
async def generate(x: Generate):
    try: return await agent.generate(x)
    except Exception as e: raise HTTPException(502, str(e))
@app.post("/api/interviews/evaluate")
async def evaluate(x: Evaluate):
    try: return await agent.evaluate(x)
    except Exception as e: raise HTTPException(502, str(e))

def ensure_complete(row: sqlite3.Row):
    questions, answers = json.loads(row["questions"]), json.loads(row["answers"])
    scored = [item for item in answers if item.get("feedback", {}).get("score") is not None]
    if len(scored) < len(questions):
        raise HTTPException(400, f"还有 {len(questions) - len(scored)} 道题未完成，暂不能归档。")

@app.post("/api/sessions/{session_id}/finalize")
async def finalize(session_id: int):
    conn = db(); row = conn.execute("SELECT questions,answers FROM sessions WHERE id=?", (session_id,)).fetchone()
    if not row:
        conn.close(); raise HTTPException(404, "训练记录不存在")
    ensure_complete(row)
    conn.execute("UPDATE sessions SET finalized=1 WHERE id=?", (session_id,)); conn.commit(); conn.close()
    return {"ok": True, "sessionId": session_id, "status": "completed"}

@app.post("/api/sessions/{session_id}/report")
async def report(session_id: int, x: Config):
    conn = db(); row = conn.execute("SELECT role,questions,answers,report FROM sessions WHERE id=?", (session_id,)).fetchone()
    if not row: raise HTTPException(404, "训练记录不存在")
    ensure_complete(row)
    conn.execute("UPDATE sessions SET finalized=1 WHERE id=?", (session_id,)); conn.commit(); conn.close()
    if row[3]: return json.loads(row[3])
    answers = json.loads(row[2]); conversation = "\n".join(f"题目：{a.get('question')}\n回答：{a.get('answer')}\n评分：{a.get('feedback',{}).get('score')}" for a in answers)
    raw = await call_model(x.apiKey, x.baseUrl, x.model, [{"role":"system","content":"你是严谨的中文技术面试研究员，只输出 JSON，不编造回答中没有的事实。"},{"role":"user","content":f"岗位：{row[0]}\n已评分回答证据：\n{conversation}\n写一份有论文分析感的复盘：结论必须基于具体回答的覆盖度、准确性、表达结构与技术深度；优点和缺口要可验证，建议要可执行。只输出：{{\"headline\":\"结论式标题\",\"score\":0-100,\"summary\":\"120字内的分析摘要\",\"strengths\":[\"3条基于证据的发现\"],\"weaknesses\":[{{\"name\":\"能力维度\",\"score\":0-100,\"advice\":\"针对性的训练建议\"}}],\"nextStep\":\"下一轮可执行训练计划\"}}"}]); result = parse_json(raw)
    conn = db(); conn.execute("UPDATE sessions SET report=? WHERE id=?", (json.dumps(result, ensure_ascii=False), session_id)); conn.commit(); conn.close(); return result
@app.post("/api/voice/start")
async def voice_start(x: VoiceTurn):
    try: return await agent.voice_start(x)
    except Exception as e: raise HTTPException(502, str(e))
@app.post("/api/voice/turn")
async def voice_turn(x: VoiceTurn):
    try: return await agent.voice_turn(x)
    except Exception as e: raise HTTPException(502, str(e))
@app.post("/api/voice/finish")
async def voice_finish(x: VoiceFinish):
    try: return await agent.voice_finish(x)
    except Exception as e: raise HTTPException(502, str(e))

@app.get("/api/sessions")
async def sessions():
    conn = db(); rows = conn.execute("SELECT * FROM sessions ORDER BY id DESC").fetchall(); conn.close(); out=[]
    for row in rows:
        qs, ans = json.loads(row[2]), json.loads(row[3]); scored=[a for a in ans if a.get("feedback",{}).get("score") is not None]; score=round(sum(a["feedback"]["score"] for a in scored)/len(scored)) if scored else None; out.append({"id":row[0],"role":row[1],"trackName":row[1],"questions":qs,"answers":ans,"createdAt":row[4],"status":"completed" if row[7] else "in_progress","questionCount":len(qs),"answeredCount":len(scored),"score":score,"report":json.loads(row[6]) if row[6] else None})
    return {"sessions": out}

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: int):
    conn = db(); result = conn.execute("DELETE FROM sessions WHERE id=?", (session_id,)); conn.commit(); conn.close()
    if not result.rowcount: raise HTTPException(404, "找不到这套训练记录。")
    return {"ok": True, "sessionId": session_id}

@app.delete("/api/sessions/{session_id}/questions")
async def delete_question(session_id: int, payload: dict[str, Any]):
    question = str(payload.get("question", "")).strip()
    conn = db(); row = conn.execute("SELECT questions,answers FROM sessions WHERE id=?", (session_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404, "找不到这套训练记录。")
    questions, answers = json.loads(row[0]), json.loads(row[1])
    remaining = [item for item in questions if item.get("question") != question]
    if len(remaining) == len(questions): conn.close(); raise HTTPException(404, "找不到要删除的题目。")
    remaining_answers = [item for item in answers if item.get("question") != question]
    # Deleting evidence invalidates any conclusion generated from the original set.
    conn.execute("UPDATE sessions SET questions=?, answers=?, report=NULL, finalized=0 WHERE id=?", (json.dumps(remaining, ensure_ascii=False), json.dumps(remaining_answers, ensure_ascii=False), session_id)); conn.commit(); conn.close()
    return {"ok": True, "sessionId": session_id, "questionCount": len(remaining)}

@app.post("/api/models/test")
async def test_model(x: Config):
    try:
        reply = await call_model(x.apiKey, x.baseUrl, x.model, [{"role":"user", "content":"仅回复 CONNECTED。"}], json_mode=False)
        return {"ok": True, "reply": reply.strip()[:80] or "CONNECTED"}
    except Exception as e: raise HTTPException(502, str(e))
@app.get("/{path:path}")
async def spa(path: str): return FileResponse(PUBLIC / "index.html")
