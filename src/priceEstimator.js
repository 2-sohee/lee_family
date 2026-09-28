import { Schema } from "firebase/ai";
import { friendlyAiError, generateWithFallback } from "./aiClient.js";

const MAX_ITEMS = 40;

const responseSchema = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          index: Schema.integer({ description: "입력 목록의 번호" }),
          unitPrice: Schema.integer({ description: "단위 1개(요청 단위 기준) 원화 가격" }),
          total: Schema.integer({ description: "요청 수량 전체 원화 가격" }),
          store: Schema.string({ description: "최저가가 예상되는 온라인 쇼핑몰 이름 (예: 쿠팡, 네이버쇼핑, SSG닷컴, 컬리, 11번가)" }),
          note: Schema.string({ description: "가격 기준 상품 규격 (짧게)" })
        },
        optionalProperties: ["note"]
      })
    })
  }
});

function describe(items) {
  return items.map((item, index) => `${index + 1}) ${item.name} ${item.qty}${item.unit}${item.category ? ` [${item.category}]` : ""}`).join("\n");
}

const RULES = `규칙:
- 한국 온라인 쇼핑몰(쿠팡, 네이버쇼핑, SSG닷컴, 컬리, 11번가, G마켓 등) 기준 원화(KRW) 최저가를 알려줘.
- unitPrice는 요청 단위 1개 가격, total은 요청 수량 전체 가격(배송비 제외)이야.
- 품목마다 index를 그대로 돌려주고, 확실하지 않아도 일반적인 시세로 추정해.`;

function parseJson(text) {
  const raw = String(text || "");
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw || "{}");
}

// Live Google Search grounding (tools: [{ googleSearch: {} }]) is not available on the
// free Spark plan (429, quota 0), so prices are AI estimates of typical online lowest prices.
async function estimateWithModel(items) {
  const prompt = `아래 장보기 품목의 일반적인 인터넷 최저가를 추정해줘.\n${describe(items)}\n${RULES}`;
  const response = await generateWithFallback([prompt], {
    key: "price-estimate",
    timeout: 20000,
    options: { generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.2 } }
  });
  return { items: parseJson(response.text()).items, source: "ai", suggestions: "" };
}

const toWon = value => Math.min(10_000_000, Math.max(0, Math.round(Number(value) || 0)));

/**
 * Estimates the lowest online price for shopping items.
 * @param {{id:string|number,name:string,qty:number,unit:string,category?:string}[]} items
 * @returns {Promise<{prices:{id,unitPrice,total,store,url,note,source}[], suggestions:string}>}
 */
export async function estimatePrices(items) {
  const list = [].concat(items).filter(item => item?.name).slice(0, MAX_ITEMS);
  if (!list.length) return { prices: [], suggestions: "" };
  let result;
  try {
    result = await estimateWithModel(list);
  } catch (error) {
    console.error(error);
    throw new Error(friendlyAiError(error, {
      retry: "잠시 후 💰 최저가 조회를 다시 눌러주세요.",
      fallback: "가격을 조회하지 못했어요. 잠시 후 다시 시도해주세요."
    }));
  }
  const prices = [];
  for (const raw of Array.isArray(result.items) ? result.items : []) {
    const item = list[Math.round(Number(raw?.index)) - 1];
    if (!item) continue;
    const qty = Math.max(0, Number(item.qty) || 1);
    const unitPrice = toWon(raw.unitPrice);
    const total = toWon(raw.total) || toWon(unitPrice * qty);
    if (!total && !unitPrice) continue;
    const url = /^https:\/\/[^\s"'<>]+$/i.test(String(raw.url || "")) ? String(raw.url).slice(0, 500) : "";
    prices.push({
      id: item.id,
      unitPrice: unitPrice || toWon(total / (qty || 1)),
      total,
      store: String(raw.store || "온라인 최저가").trim().slice(0, 30),
      url,
      note: String(raw.note || "").trim().slice(0, 60),
      source: result.source
    });
  }
  return { prices, suggestions: result.suggestions };
}
