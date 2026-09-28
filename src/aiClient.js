import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { firebaseApp } from "./firebase.js";

// Ordered by measured latency/quality (2026-09-29). The last model that answered
// is tried first, and models that recently failed are skipped for a while.
export const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.1-flash-lite"];
const LAST_OK_KEY = "lee-family:ai-last-ok";
const COOLDOWN_KEY = "lee-family:ai-cooldown";

let ai = null;
const models = new Map();
// Thinking tokens dominate latency for these structured tasks, so thinking is
// kept minimal. Some models reject MINIMAL; they fall back to LOW, then default.
const THINKING_STEPS = ["minimal", "low", null];
const thinkingStep = new Map();

function modelFor(name, key, options) {
  if (!firebaseApp) throw new Error("Firebase 설정이 필요해요.");
  ai ||= getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const level = THINKING_STEPS[thinkingStep.get(name) || 0];
  const id = `${key}:${name}:${level}`;
  if (!models.has(id)) {
    const generationConfig = { ...(options?.generationConfig || {}), ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}) };
    models.set(id, getGenerativeModel(ai, { model: name, ...options, generationConfig }));
  }
  return models.get(id);
}

export const statusOf = error => Number(error?.customErrorData?.status) || Number(/\[(\d{3})\b/.exec(String(error?.message || ""))?.[1]) || 0;
const codeOf = error => String(error?.code || "");
const messageOf = error => String(error?.message || "");
const thinkingRejected = error => statusOf(error) === 400 && /thinking/i.test(messageOf(error));
// Overloaded, rate limited, retired, timed out or network-level failures are worth retrying on another model.
const retryable = error => [404, 408, 429, 500, 502, 503, 504].includes(statusOf(error)) || /high demand|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED|Failed to fetch|NetworkError|Load failed|timed? ?out|abort/i.test(messageOf(error));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; }
}
function coolingDown() {
  const now = Date.now(), map = readJson(COOLDOWN_KEY, {});
  return new Set(Object.keys(map).filter(name => map[name] > now));
}
function nextQuotaReset() {
  // Free-tier daily quotas reset at midnight Pacific time.
  const now = new Date();
  const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const midnight = new Date(pacific);
  midnight.setHours(24, 0, 30, 0);
  return now.getTime() + (midnight - pacific);
}
function coolDown(name, error) {
  const status = statusOf(error);
  const hinted = Number(/retry in ([\d.]+)s/i.exec(messageOf(error))?.[1]);
  const daily = status === 429 && /PerDay/i.test(`${messageOf(error)} ${JSON.stringify(error?.customErrorData || {})}`);
  const seconds = status === 429 ? Math.min(600, Math.max(30, hinted || 60)) : status === 404 ? 3600 : 30;
  const map = readJson(COOLDOWN_KEY, {});
  map[name] = daily ? nextQuotaReset() : Date.now() + seconds * 1000;
  try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map)); } catch { /* storage unavailable */ }
}

function orderedChain(chain) {
  const last = localStorage.getItem(LAST_OK_KEY);
  const ordered = last && chain.includes(last) ? [last, ...chain.filter(name => name !== last)] : [...chain];
  const cooling = coolingDown();
  const ready = ordered.filter(name => !cooling.has(name));
  return ready.length ? [...ready, ...ordered.filter(name => cooling.has(name))] : ordered;
}

/** Runs a request across the model chain, retrying transient failures. Returns the SDK response. */
export async function generateWithFallback(parts, { key, options, models: chain = MODELS, rounds = 2, timeout = 30000 }) {
  let lastError = null;
  for (let round = 0; round < rounds; round++) {
    if (round) await sleep(1500);
    for (const name of orderedChain(chain)) {
      for (let attempt = 0; attempt < THINKING_STEPS.length; attempt++) {
        try {
          const result = await modelFor(name, key, options).generateContent(parts, { timeout });
          try { localStorage.setItem(LAST_OK_KEY, name); } catch { /* storage unavailable */ }
          return result.response;
        } catch (error) {
          lastError = error;
          if (thinkingRejected(error) && (thinkingStep.get(name) || 0) < THINKING_STEPS.length - 1) {
            thinkingStep.set(name, (thinkingStep.get(name) || 0) + 1);
            continue;
          }
          console.warn(`AI model ${name} failed`, statusOf(error), messageOf(error));
          if (!retryable(error)) throw error;
          coolDown(name, error);
          break;
        }
      }
    }
  }
  throw lastError;
}

export function friendlyAiError(error, { retry = "잠시 후 다시 시도해주세요.", badRequest = "요청을 처리하지 못했어요.", fallback = "AI 응답을 받지 못했어요." } = {}) {
  const status = statusOf(error), code = codeOf(error), text = messageOf(error);
  if (code.includes("api-not-enabled") || /SERVICE_DISABLED|has not been used in project|API_KEY_SERVICE_BLOCKED/i.test(text)) {
    return "AI 기능이 아직 활성화되지 않았어요. 관리자가 Firebase Console > AI Logic에서 Gemini Developer API를 켜야 해요.";
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return "AI 사용량 한도에 도달했어요. 1~2분 뒤 다시 시도해주세요.";
  if ([500, 502, 503, 504].includes(status) || /high demand|overloaded|UNAVAILABLE/i.test(text)) return `지금 AI 서버에 요청이 많아요. ${retry}`;
  if (/timed? ?out|abort/i.test(text)) return `AI 응답이 너무 오래 걸려요. ${retry}`;
  if (status === 403) return "AI 호출 권한이 없어요. Firebase Console > AI Logic 설정과 API 키 제한을 확인해주세요.";
  if (status === 400) return badRequest;
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(text)) return "AI 서버에 연결하지 못했어요. 네트워크(와이파이/데이터)를 확인한 뒤 다시 시도해주세요.";
  return fallback;
}
