import express from 'express'
import multer from 'multer'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dataFile = path.join(root, 'data.json')
const app = express(); const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
app.use(express.json({ limit: '1mb' })); app.use(express.static(path.join(root, 'public')))
async function readData() { try { return JSON.parse(await fs.readFile(dataFile, 'utf8')) } catch { return { sessions: [] } } }
async function writeData(data) { await fs.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8') }
async function model({ apiKey, baseUrl, model, messages }) {
  if (!apiKey || !baseUrl || !model) throw new Error('请先填写 API Key、服务地址和模型名称。')
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: .3, messages, response_format: { type: 'json_object' } }) })
  const text = await response.text(); let payload; try { payload = JSON.parse(text) } catch { throw new Error(`模型返回格式异常：${text.slice(0, 180)}`) }
  if (!response.ok) throw new Error(payload.error?.message || `模型请求失败（${response.status}）`)
  return payload.choices?.[0]?.message?.content || ''
}
function parseJson(text) { const start = text.indexOf('{'); const end = text.lastIndexOf('}'); return JSON.parse(text.slice(start, end + 1)) }
app.post('/api/extract', upload.single('resume'), async (req, res) => { try { if (!req.file) throw new Error('请选择 PDF 简历。'); const parsed = await pdfParse(req.file.buffer); res.json({ text: parsed.text.slice(0, 24000), fileName: req.file.originalname }) } catch (error) { res.status(400).json({ error: error.message }) } })
app.post('/api/generate', async (req, res) => { try { const { apiKey, baseUrl, model: modelName, role, description, resumeText, count = 15 } = req.body; const raw = await model({ apiKey, baseUrl, model: modelName, messages: [{ role: 'system', content: '你是严谨、简历驱动的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `目标岗位：${role}\n岗位描述：${description}\n简历：${String(resumeText).slice(0, 24000)}\n生成${count}道题，覆盖基础八股、项目深挖、业务场景、系统设计、反问。每题返回 section、question、reference、difficulty。不要编造简历经历。格式：{"questions":[...]}` }] }); const questions = parseJson(raw).questions?.filter(item => item.question); if (!questions?.length) throw new Error('模型没有返回有效题目。'); const session = { id: Date.now(), role, questions, answers: [], createdAt: new Date().toISOString() }; const data = await readData(); data.sessions.unshift(session); await writeData(data); res.json({ session }) } catch (error) { res.status(502).json({ error: error.message }) } })
app.post('/api/evaluate', async (req, res) => { try { const { apiKey, baseUrl, model: modelName, sessionId, question, answer } = req.body; const raw = await model({ apiKey, baseUrl, model: modelName, messages: [{ role: 'system', content: '你是客观、精炼的中文技术面试官，只输出 JSON。' }, { role: 'user', content: `题目：${question.question}\n参考答案：${question.reference || ''}\n候选人回答：${answer}\n只输出：{"score":0-100,"summary":"不超过80字","strengths":["最多2条"],"improvements":["最多2条"],"followUp":"一个追问"}` }] }); const feedback = parseJson(raw); const data = await readData(); const session = data.sessions.find(item => item.id === Number(sessionId)); if (session) { session.answers = session.answers.filter(item => item.question !== question.question); session.answers.push({ question: question.question, answer, feedback }); await writeData(data) } res.json({ feedback }) } catch (error) { res.status(502).json({ error: error.message }) } })
app.get('/api/sessions', async (_req, res) => res.json(await readData()))
app.get('*', (_req, res) => res.sendFile(path.join(root, 'public/index.html')))
app.listen(process.env.PORT || 5175, () => console.log(`OfferPilot Light running at http://localhost:${process.env.PORT || 5175}`))
