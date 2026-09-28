import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { firebaseApp } from "./firebase.js";

// Newest stable model first; on overload/unavailability the next model is tried.
export const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];

let ai = null;
const models = new Map();

function modelFor(name, key, options) {
  if (!firebaseApp) throw new Error("Firebase 설정이 필요해요.");
  ai ||= getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const id = `${key}:${name}`;
  if (!models.has(id)) models.set(id, getGenerativeModel(ai, { model: name, ...options }));
  return models.get(id);
}

export const statusOf = error => Number(error?.customErrorData?.status) || Number(/\[(\d{3})\b/.exec(String(error?.message || ""))?.[1]) || 0;
const codeOf = error => String(error?.code || "");
// Overloaded, rate limited, retired or network-level failures are worth retrying on another model.
const retryable = error => [404, 408, 429, 500, 502, 503, 504].includes(statusOf(error)) || /high demand|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED|Failed to fetch|NetworkError|Load failed/i.test(String(error?.message || ""));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Runs a request across the model chain, retrying transient failures. Returns the SDK response. */
export async function generateWithFallback(parts, { key, options, models: chain = MODELS, rounds = 2 }) {
  let lastError = null;
  for (let round = 0; round < rounds; round++) {
    if (round) await sleep(2000);
    for (const name of chain) {
      try {
        const result = await modelFor(name, key, options).generateContent(parts);
        return result.response;
      } catch (error) {
        lastError = error;
        console.warn(`AI model ${name} failed`, statusOf(error), error?.message);
        if (!retryable(error)) throw error;
      }
    }
  }
  throw lastError;
}

export function friendlyAiError(error, { retry = "잠시 후 다시 시도해주세요.", badRequest = "요청을 처리하지 못했어요.", fallback = "AI 응답을 받지 못했어요." } = {}) {
  const status = statusOf(error), code = codeOf(error), text = String(error?.message || "");
  if (code.includes("api-not-enabled") || /SERVICE_DISABLED|has not been used in project|API_KEY_SERVICE_BLOCKED/i.test(text)) {
    return "AI 기능이 아직 활성화되지 않았어요. 관리자가 Firebase Console > AI Logic에서 Gemini Developer API를 켜야 해요.";
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return "AI 사용량 한도에 도달했어요. 1~2분 뒤 다시 시도해주세요.";
  if ([500, 502, 503, 504].includes(status) || /high demand|overloaded|UNAVAILABLE/i.test(text)) return `지금 AI 서버에 요청이 많아요. ${retry}`;
  if (status === 403) return "AI 호출 권한이 없어요. Firebase Console > AI Logic 설정과 API 키 제한을 확인해주세요.";
  if (status === 400) return badRequest;
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(text)) return "AI 서버에 연결하지 못했어요. 네트워크(와이파이/데이터)를 확인한 뒤 다시 시도해주세요.";
  return fallback;
}
