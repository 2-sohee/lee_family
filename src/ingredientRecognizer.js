import { Schema } from "firebase/ai";
import { friendlyAiError, generateWithFallback } from "./aiClient.js";

export const PLACES = ["냉장실", "냉동실", "실온"];

// Short keys keep the JSON output small; output tokens dominate recognition latency.
const responseSchema = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          n: Schema.string({ description: "한국어 재료 이름 (예: 계란, 대파, 방울토마토)" }),
          e: Schema.string({ description: "재료를 나타내는 이모지 1개" }),
          q: Schema.string({ description: "수량과 단위 (예: 6개, 1팩, 1L 2개)" }),
          p: Schema.enumString({ enum: PLACES, description: "권장 보관 위치" }),
          d: Schema.integer({ description: "오늘부터 권장 소비 기한까지 남은 일수 추정치" }),
          c: Schema.number({ description: "0~1 인식 확신도. 0.8 미만일 때만 넣기" })
        },
        optionalProperties: ["c"],
        propertyOrdering: ["n", "e", "q", "p", "d", "c"]
      })
    })
  }
});

const PROMPT = `너는 가정용 냉장고 정리 도우미야. 첨부된 사진에서 냉장고에 넣을 식재료와 식품을 빠짐없이 찾아줘.
사진은 냉장고 내부·장바구니 같은 실물 사진일 수도 있고, 영수증·온라인 주문내역 캡처·장보기 메모·제품 라벨처럼 글씨가 많은 사진일 수도 있어.

[글씨가 있는 사진 규칙]
- 글자를 한 줄씩 끝까지 꼼꼼히 읽고, 식품에 해당하는 줄은 하나도 빠뜨리지 마.
- 상품명은 브랜드·용량·규격을 떼고 일반 재료명으로 바꿔 (예: "서울우유 나100% 1L" → 우유, "풀무원 국산콩 두부 300g" → 두부, "비비고 왕교자 1.05kg" → 만두).
- 수량은 수량 칸이나 "x2", "*3", "2개" 표기를 반영하고, 용량이 있으면 함께 적어 (예: 수량 2, 1L → "1L 2개").
- 가격·할인·합계·카드·포인트·매장/날짜 정보, 봉투, 세제·휴지·샴푸 같은 생활용품은 제외해.
- 글자가 흐리거나 잘려서 확실하지 않으면 추측해서 적되 confidence를 0.5 미만으로 낮게 줘.

[공통 규칙]
- 사진에 없는 재료를 지어내지 마.
- 같은 재료는 하나로 합치고 수량을 합산해.
- 그릇, 용기, 냉장고 부품 같은 비식품은 제외해.
- 이름은 한국어로 짧게, place는 냉장실/냉동실/실온 중 하나로 적어 (냉동식품은 냉동실, 쌀·라면·통조림·양념은 실온).
- expiryDays는 구입 직후 기준 일반적인 권장 소비 기한으로 추정해.
- 재료가 하나도 없으면 items를 빈 배열로 반환해.

[출력 형식] items의 각 항목: n=재료명, e=이모지 1개, q=수량, p=보관 위치, d=권장 소비 기한까지 일수, c=확신도(0.8 미만일 때만 넣고 확실하면 생략).`;

function toPart(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("인식할 수 없는 사진 형식이에요.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function normalize(items) {
  const seen = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const raw = { name: item?.n ?? item?.name, emoji: item?.e ?? item?.emoji, qty: item?.q ?? item?.qty, place: item?.p ?? item?.place, expiryDays: item?.d ?? item?.expiryDays, confidence: item?.c ?? item?.confidence };
    const name = String(raw.name || "").trim().slice(0, 40);
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
      timeout: 40000,
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