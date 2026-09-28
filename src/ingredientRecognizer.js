import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "firebase/ai";
import { firebaseApp } from "./firebase.js";

// Newest stable model first; older ones are fallbacks if a model is retired or unavailable.
const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash"];
export const PLACES = ["냉장실", "냉동실", "실온"];

const responseSchema = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string({ description: "한국어 재료 이름 (예: 계란, 대파, 방울토마토)" }),
          emoji: Schema.string({ description: "재료를 나타내는 이모지 1개" }),
          qty: Schema.string({ description: "보이는 수량과 단위 (예: 6개, 1팩, 500ml, 반 통)" }),
          place: Schema.enumString({ enum: PLACES, description: "권장 보관 위치" }),
          expiryDays: Schema.integer({ description: "오늘부터 권장 소비 기한까지 남은 일수 추정치" }),
          confidence: Schema.number({ description: "0~1 사이 인식 확신도" })
        },
        optionalProperties: ["confidence"]
      })
    })
  }
});

const PROMPT = `너는 가정용 냉장고 정리 도우미야. 첨부된 냉장고/식재료 사진에서 실제로 보이는 식재료와 식품만 찾아줘.
규칙:
- 사진에 명확히 보이는 것만 포함하고, 추측으로 만들어내지 마.
- 같은 재료는 하나로 합치고 수량을 합산해.
- 포장 식품은 라벨을 읽을 수 있으면 제품 종류로(예: 우유, 두부, 김치) 적어.
- 그릇, 용기, 냉장고 부품 같은 비식품은 제외해.
- 이름은 한국어로 짧게, place는 냉장실/냉동실/실온 중 하나로 적어.
- 재료가 하나도 없으면 items를 빈 배열로 반환해.`;

let ai = null;
const models = new Map();

function modelFor(name) {
  if (!firebaseApp) throw new Error("Firebase 설정이 필요해요.");
  ai ||= getAI(firebaseApp, { backend: new GoogleAIBackend() });
  if (!models.has(name)) {
    models.set(name, getGenerativeModel(ai, {
      model: name,
      generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.2 }
    }));
  }
  return models.get(name);
}

function toPart(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("인식할 수 없는 사진 형식이에요.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

const isModelMissing = error => /404|not found|is not supported|unsupported model/i.test(String(error?.message || ""));

export function friendlyAiError(error) {
  const text = String(error?.message || error || "");
  if (/api-not-enabled|has not been used|is disabled|SERVICE_DISABLED|firebasevertexai|generativelanguage|API_KEY_SERVICE_BLOCKED|PERMISSION_DENIED|403/i.test(text)) {
    return "AI 재료 인식이 아직 활성화되지 않았어요. 관리자가 Firebase Console > AI Logic에서 '시작하기'를 눌러 Gemini Developer API를 켜야 해요.";
  }
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(text)) return "AI 사용량 한도에 도달했어요. 잠시 후 다시 시도해주세요.";
  if (/network|fetch|Failed to fetch|offline/i.test(text)) return "네트워크 연결을 확인한 뒤 다시 시도해주세요.";
  return "사진에서 재료를 인식하지 못했어요. 더 밝고 가까운 사진으로 다시 시도해주세요.";
}

function normalize(items) {
  const seen = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const name = String(raw?.name || "").trim().slice(0, 40);
    if (!name) continue;
    const key = name.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    const days = Math.round(Number(raw.expiryDays));
    seen.set(key, {
      name,
      emoji: String(raw.emoji || "🥕").trim().slice(0, 4) || "🥕",
      qty: String(raw.qty || "1개").trim().slice(0, 20) || "1개",
      place: PLACES.includes(raw.place) ? raw.place : "냉장실",
      expiryDays: Number.isFinite(days) ? Math.min(365, Math.max(0, days)) : 7,
      confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : null
    });
  }
  return [...seen.values()];
}

export async function recognizeIngredients(dataUrls) {
  const parts = [PROMPT, ...[].concat(dataUrls).slice(0, 4).map(toPart)];
  let lastError = null;
  for (const name of MODELS) {
    try {
      const result = await modelFor(name).generateContent(parts);
      const parsed = JSON.parse(result.response.text() || "{}");
      return normalize(parsed.items);
    } catch (error) {
      lastError = error;
      if (!isModelMissing(error)) break;
    }
  }
  console.error(lastError);
  throw new Error(friendlyAiError(lastError));
}
