import { Schema } from "firebase/ai";
import { friendlyAiError, generateWithFallback } from "./aiClient.js";

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

function toPart(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("인식할 수 없는 사진 형식이에요.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
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
  try {
    const response = await generateWithFallback(parts, {
      key: "recognize",
      options: { generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.2 } }
    });
    return normalize(JSON.parse(response.text() || "{}").items);
  } catch (error) {
    console.error(error);
    throw new Error(friendlyAiError(error, {
      retry: "잠시 후 🔍 인식 버튼을 다시 눌러주세요.",
      badRequest: "사진을 처리하지 못했어요. 다른 사진으로 다시 시도해주세요.",
      fallback: "사진에서 재료를 인식하지 못했어요. 더 밝고 가까운 사진으로 다시 시도해주세요."
    }));
  }
}