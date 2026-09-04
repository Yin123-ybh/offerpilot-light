import express from 'express'
import multer from 'multer'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dataFile = path.join(root, 'data.json')
const app = express(); const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
// The formal frontend sends PDF files as base64 JSON; 10 MB PDFs expand to roughly 13.5 MB.
app.use(express.json({ limit: '15mb' })); app.use(express.static(path.join(root, 'public')))
async function readData() { try { return JSON.parse(await fs.readFile(dataFile, 'utf8')) } catch { return { sessions: [] } } }
async function writeData(data) { await fs.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8') }
async function model({ apiKey, baseUrl, model, messages, jsonMode = true }) {
  if (!apiKey || !baseUrl || !model) throw new Error('请先填写 API Key、服务地址和模型名称。')
  const requestMessages = messages.map(message => message.role === 'user' && /生成\d*道题/.test(message.content)
    ? { ...message, content: `${message.content}\n每题必须额外返回 resumeEvidence 字段，写出 20-80 字的具体简历依据；项目题点名简历中的项目或技术事实，通用题说明对应技术栈或岗位要求，不得编造。` }
    : message)
  const payload = { model, temperature: .3, messages: requestMessages }; if (jsonMode) payload.response_format = { type: 'json_object' }
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(payload) })
  const text = await response.text(); let resultPayload; try { resultPayload = JSON.parse(text) } catch { throw new Error(`模型返回格式异常：${text.slice(0, 180)}`) }
  if (!response.ok) throw new Error(resultPayload.error?.message || `模型请求失败（${response.status}）`)
  return resultPayload.choices?.[0]?.message?.content || ''
}
function parseJson(text) { const start = text.indexOf('{'); const end = text.lastIndexOf('}'); return JSON.parse(text.slice(start, end + 1)) }
function normalizeQuestion(value) { if (value && typeof value === 'object') value = value.question || value.questionText || value.question_text; return String(value || '').replace(/\s+/g, ' ').trim() }
function ensureComplete(session) {
  const required = new Set((session.questions || []).map(item => normalizeQuestion(item.question)))
  const scored = new Set((session.answers || []).filter(item => item.feedback?.score != null).map(item => normalizeQuestion(item.question)))
  const missing = [...required].filter(item => !scored.has(item))
  return missing
}
app.post('/api/models/test', async (req, res) => {
  try {
    const { apiKey, baseUrl, model: modelName } = req.body || {}
    if (!apiKey || !baseUrl || !modelName) throw new Error('请填写 API Key、服务地址和模型名称。')
    let response
    try {
      response = await fetch(`${String(baseUrl).replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: '请只回复 OK' }], temperature: 0 })
      })
    } catch {
      throw new Error('无法连接服务地址，请检查网络或服务地址。')
    }
    const text = await response.text()
    let payload = {}
    try { payload = JSON.parse(text) } catch { /* Preserve a useful status for non-JSON upstream responses. */ }
    if (!response.ok) {
      const detail = payload.error?.message || payload.message || text.slice(0, 180)
      throw new Error(`模型连接失败（${response.status}）：${detail}`)
    }
    res.json({ reply: payload.choices?.[0]?.message?.content || '模型可用' })
  } catch (error) {
    res.status(502).json({ error: error.message })
  }
})
app.post('/api/extract', upload.single('resume'), async (req, res) => { try { if (!req.file) throw new Error('请选择 PDF 简历。'); const parsed = await pdfParse(req.file.buffer); res.json({ text: parsed.text.slice(0, 24000), fileName: req.file.originalname }) } catch (error) { res.status(400).json({ error: error.message }) } })
app.post('/api/resume/extract', async (req, res) => { try { const { fileName = 'resume.pdf', base64 } = req.body; if (!base64) throw new Error('请选择 PDF 简历。'); const cleanBase64 = String(base64).replace(/^data:application\/pdf;base64,/i, '').replace(/\s/g, ''); const buffer = Buffer.from(cleanBase64, 'base64'); if (buffer.length < 16 || buffer.subarray(0, 4).toString() !== '%PDF') throw new Error('文件不是有效的 PDF，请重新选择简历。'); let text = ''; try { const parsed = await pdfParse(buffer); text = String(parsed.text || '').replace(/\u0000/g, '').trim().slice(0, 24000) } catch { /* Some PDFs have valid pages but unsupported embedded fonts. */ } if (!text) text = `未能从文件“${fileName}”提取可复制文字。这是一份可能包含扫描图片或特殊字体的 PDF，请根据岗位信息生成通用技术面试题，并在无法确认简历经历时不要编造。`; res.json({ text, fileName, documentId: `${Date.now()}-${fileName}`, extracted: !text.startsWith('未能从文件') }) } catch (error) { res.status(400).json({ error: error.message }) } })
app.post('/api/generate', async (req, res) => { try { const { apiKey, baseUrl, model: modelName, role, description, resumeText, count = 15 } = req.body; const raw = await model({ apiKey, baseUrl, model: modelName, messages: [{ role: 'system', content: '你是严谨、简历驱动的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `目标岗位：${role}\n岗位描述：${description}\n简历：${String(resumeText).slice(0, 24000)}\n生成${count}道题，覆盖基础八股、项目深挖、业务场景、系统设计、反问。每题返回 section、question、reference、difficulty。不要编造简历经历。格式：{"questions":[...]}` }] }); const questions = parseJson(raw).questions?.filter(item => item.question); if (!questions?.length) throw new Error('模型没有返回有效题目。'); const session = { id: Date.now(), role, questions, answers: [], createdAt: new Date().toISOString() }; const data = await readData(); data.sessions.unshift(session); await writeData(data); res.json({ session }) } catch (error) { res.status(502).json({ error: error.message }) } })
app.post('/api/interviews/generate', async (req, res) => { try { const body = req.body || {}; const role = body.role || '技术岗位'; const raw = await model({ apiKey: body.textApiKey || body.apiKey, baseUrl: body.textBaseUrl || body.baseUrl, model: body.textModel || body.model, messages: [{ role: 'system', content: '你是严谨、简历驱动的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `目标岗位：${role}\n岗位描述：${body.jobDescription || ''}\n简历：${String(body.resumeText || '').slice(0, 24000)}\n生成${body.questionCount || 15}道题，覆盖基础八股、项目深挖、业务场景、系统设计、反问。每题返回 section、question、reference、difficulty。不要编造简历经历。格式：{"questions":[...]}` }] }); const questions = parseJson(raw).questions?.filter(item => item.question); if (!questions?.length) throw new Error('模型没有返回有效题目。'); const session = { id: Date.now(), role, trackName: role, questions, answers: [], createdAt: new Date().toISOString(), status: 'in_progress', questionCount: questions.length, answeredCount: 0 }; const data = await readData(); data.sessions.unshift(session); await writeData(data); res.json({ questions, session }) } catch (error) { res.status(502).json({ error: error.message }) } })
app.post('/api/evaluate', async (req, res) => { try { const { apiKey, baseUrl, model: modelName, sessionId, question, answer } = req.body; const raw = await model({ apiKey, baseUrl, model: modelName, messages: [{ role: 'system', content: '你是客观、精炼的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `题目：${question.question}\n参考答案：${question.reference || ''}\n候选人回答：${answer}\n只输出：{"score":0-100,"summary":"不超过80字","strengths":["最多2条"],"improvements":["最多2条"],"followUp":"一个追问"}` }] }); const feedback = parseJson(raw); const data = await readData(); const session = data.sessions.find(item => item.id === Number(sessionId)); if (session) { session.answers = session.answers.filter(item => item.question !== question.question); session.answers.push({ question: question.question, answer, feedback }); await writeData(data) } res.json({ feedback }) } catch (error) { res.status(502).json({ error: error.message }) } })
app.post('/api/interviews/evaluate', async (req, res) => { try { const body = req.body || {}; const q = body.question || {}; const raw = await model({ apiKey: body.textApiKey || body.apiKey, baseUrl: body.textBaseUrl || body.baseUrl, model: body.textModel || body.model, messages: [{ role: 'system', content: '你是客观、精炼的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `题目：${q.question}\n参考答案：${q.reference || ''}\n候选人回答：${body.answer || ''}\n只输出：{"score":0-100,"summary":"不超过80字","strengths":["最多2条"],"improvements":["最多2条"],"followUp":"一个追问"}` }] }); const feedback = parseJson(raw); const data = await readData(); const session = data.sessions.find(item => item.id === Number(body.sessionId)); if (session) { session.answers = (session.answers || []).filter(item => item.question !== q.question); session.answers.push({ question: q.question, answer: body.answer, feedback }); session.answeredCount = session.answers.filter(item => item.feedback?.score != null).length; session.status = session.answeredCount >= (session.questions?.length || 0) ? 'completed' : 'in_progress'; await writeData(data) } res.json({ feedback }) } catch (error) { res.status(502).json({ error: error.message }) } })
app.post('/api/sessions/:id/finalize', async (req, res) => { try { const data = await readData(); const session = data.sessions.find(item => Number(item.id) === Number(req.params.id)); if (!session) return res.status(404).json({ error: '训练记录不存在' }); ensureComplete(session); session.status = 'completed'; session.finalized = true; await writeData(data); res.json({ ok: true, sessionId: Number(req.params.id), status: 'completed' }) } catch (error) { res.status(400).json({ error: error.message }) } })
app.post('/api/sessions/:id/report', async (req, res) => {
  try {
    const data = await readData(); const session = data.sessions.find(item => Number(item.id) === Number(req.params.id));
    if (!session) return res.status(404).json({ error: '训练记录不存在' }); ensureComplete(session)
    if (session.report) return res.json(session.report)
    const conversation = (session.answers || []).map(a => `题目：${a.question}\n回答：${a.answer}\n评分：${a.feedback?.score}`).join('\n')
    const body = req.body || {}; const messages = [{ role: 'system', content: '你是严谨的中文技术面试研究员，只输出 JSON，不编造回答中没有的事实。' }, { role: 'user', content: `岗位：${session.role}\n已评分回答证据：\n${conversation}\n写一份有论文分析感的复盘：结论必须基于具体回答的覆盖度、准确性、表达结构与技术深度；优点和缺口要可验证，建议要可执行。只输出：{"headline":"结论式标题","score":0-100,"summary":"120字内的分析摘要","strengths":["3条基于证据的发现"],"weaknesses":[{"name":"能力维度","score":0-100,"advice":"针对性的训练建议"}],"nextStep":"下一轮可执行训练计划"}` }]
    let result; try { result = parseJson(await model({ apiKey: body.apiKey, baseUrl: body.baseUrl, model: body.model, messages })) } catch { result = parseJson(await model({ apiKey: body.apiKey, baseUrl: body.baseUrl, model: body.model, messages, jsonMode: false })) }
    session.report = result; session.status = 'completed'; session.finalized = true; await writeData(data); res.json(result)
  } catch (error) { res.status(502).json({ error: error.message }) }
})
app.post('/api/voice/start', async (req, res) => { try { const { apiKey, baseUrl, model: modelName, role, resumeText } = req.body; const raw = await model({ apiKey, baseUrl, model: modelName, messages: [{ role: 'system', content: '你是专业、克制的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `候选人目标岗位：${role}\n候选人简历：${String(resumeText || '').slice(0, 16000)}\n开始一场语音模拟面试，先自然开场并提出第一个具体问题，优先结合简历项目。只输出：{"opening":"开场和问题","focus":"考察重点"}` }] }); const result = parseJson(raw); if (!result.opening) throw new Error('语音模型没有返回首个问题。'); res.json(result) } catch (error) { res.status(502).json({ error: error.message }) } })
app.post('/api/voice/turn', async (req, res) => { try { const { apiKey, baseUrl, model: modelName, role, resumeText, history = [], answer } = req.body; const conversation = history.slice(-8).map(item => `${item.role === 'candidate' ? '候选人' : '面试官'}：${item.content}`).join('\n'); const raw = await model({ apiKey, baseUrl, model: modelName, messages: [{ role: 'system', content: '你是严格但有礼貌的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `岗位：${role}\n简历摘要：${String(resumeText || '').slice(0, 8000)}\n对话：\n${conversation}\n候选人刚刚回答：${answer}\n请简短评价回答中的有效信息，并提出一个有递进性的追问。只输出：{"interviewerMessage":"评价加追问，不超过180字","focus":"下一题考察重点"}` }] }); const result = parseJson(raw); if (!result.interviewerMessage) throw new Error('语音模型没有返回追问。'); res.json(result) } catch (error) { res.status(502).json({ error: error.message }) } })
app.post('/api/voice/finish', async (req, res) => { try { const { apiKey, baseUrl, model: modelName, role, history = [] } = req.body; const conversation = history.slice(-16).map(item => `${item.role === 'candidate' ? '候选人' : '面试官'}：${item.content}`).join('\n'); const raw = await model({ apiKey, baseUrl, model: modelName, messages: [{ role: 'system', content: '你是严谨、客观的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `评估这场${role}语音模拟面试。以下是对话：\n${conversation}\n只输出：{"score":0-100,"summary":"不超过100字","strengths":["最多3条"],"improvements":["最多3条"],"nextStep":"下一次练习建议"}` }] }); res.json(parseJson(raw)) } catch (error) { res.status(502).json({ error: error.message }) } })
app.get('/api/sessions', async (_req, res) => { const data = await readData(); data.sessions = (data.sessions || []).map(s => { const answers = s.answers || []; const scored = answers.filter(a => Number.isFinite(Number(a.feedback?.score))); const score = scored.length ? Math.round(scored.reduce((n, a) => n + Number(a.feedback.score), 0) / scored.length) : null; return { ...s, status: scored.length >= (s.questions?.length || 0) && (s.questions?.length || 0) > 0 ? 'completed' : 'in_progress', questionCount: s.questions?.length || 0, answeredCount: scored.length, score, trackName: s.role || '技术岗位' } }); res.json(data) })
app.delete('/api/sessions/:id', async (req, res) => { const data = await readData(); const id = Number(req.params.id); const before = data.sessions.length; data.sessions = data.sessions.filter(s => Number(s.id) !== id); if (data.sessions.length === before) return res.status(404).json({ error: '找不到这套训练记录。' }); await writeData(data); res.json({ ok: true, sessionId: id }) })
app.delete('/api/sessions/:id/questions', async (req, res) => { const data = await readData(); const session = data.sessions.find(s => Number(s.id) === Number(req.params.id)); if (!session) return res.status(404).json({ error: '找不到这套训练记录。' }); let rawQuestion = req.body?.question ?? req.body?.questionText ?? req.body?.question_text; let question = normalizeQuestion(rawQuestion); const index = Number.isInteger(Number(req.body?.index)) ? Number(req.body.index) : -1; const before = session.questions?.length || 0; if (index >= 0 && index < before) question = normalizeQuestion(session.questions[index]?.question); session.questions = (session.questions || []).filter((item, i) => (index >= 0 && index < before) ? i !== index : normalizeQuestion(item.question) !== question); if (session.questions.length === before) return res.status(404).json({ error: '找不到要删除的题目。' }); session.answers = (session.answers || []).filter(item => normalizeQuestion(item) !== question); session.report = null; session.finalized = false; session.status = 'in_progress'; session.questionCount = session.questions.length; session.answeredCount = session.answers.filter(item => item.feedback?.score != null).length; await writeData(data); res.json({ ok: true, sessionId: Number(req.params.id), questionCount: session.questions.length }) })
app.get('*', (_req, res) => res.sendFile(path.join(root, 'public/index.html')))
const port = process.env.PORT || 5175
app.listen(port, '127.0.0.1', () => console.log(`OfferPilot Light running at http://localhost:${port}`))
