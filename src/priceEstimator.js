import { Schema } from "firebase/ai";
import { friendlyAiError, generateWithFallback, statusOf } from "./aiClient.js";

const MAX_ITEMS = 40;
const SEARCH_BLOCK_KEY = "lee-family:price-search-blocked-until";

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

const searchBlocked = () => Number(localStorage.getItem(SEARCH_BLOCK_KEY) || 0) > Date.now();

function parseJson(text) {
  const raw = String(text || "");
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw || "{}");
}

// Live Google Search grounding needs a paid Gemini plan; on the free plan it is skipped for a while.
async function searchPrices(items) {
  const prompt = `아래 장보기 품목의 현재 인터넷 최저가를 Google 검색으로 찾아줘.\n${describe(items)}\n${RULES}\n- 찾은 상품 페이지 주소를 url에 넣어줘.\n- 다른 설명 없이 JSON만 출력: {"items":[{"index":1,"unitPrice":0,"total":0,"store":"","url":"","note":""}]}`;
  const response = await generateWithFallback([prompt], {
    key: "price-search",
    options: { tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.1 } },
    models: ["gemini-3.7-flash", "gemini-3.8-flash"],
    rounds: 1
  });
  const metadata = response.candidates?.[0]?.groundingMetadata;
  return { items: parseJson(response.text()).items, source: "search", suggestions: metadata?.searchEntryPoint?.renderedContent || "" };
}

async function estimateWithModel(items) {
  const prompt = `아래 장보기 품목의 일반적인 인터넷 최저가를 추정해줘.\n${describe(items)}\n${RULES}`;
  const response = await generateWithFallback([prompt], {
    key: "price-estimate",
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
  let result = null;
  if (!searchBlocked()) {
    try {
      result = await searchPrices(list);
    } catch (error) {
      if ([400, 403, 429].includes(statusOf(error))) localStorage.setItem(SEARCH_BLOCK_KEY, String(Date.now() + 6 * 3600_000));
    }
  }
  if (!Array.isArray(result?.items) || !result.items.length) {
    try {
      result = await estimateWithModel(list);
    } catch (error) {
      console.error(error);
      throw new Error(friendlyAiError(error, {
        retry: "잠시 후 💰 최저가 조회를 다시 눌러주세요.",
        fallback: "가격을 조회하지 못했어요. 잠시 후 다시 시도해주세요."
      }));
    }
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
