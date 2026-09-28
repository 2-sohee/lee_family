const MAX_PROFILE_BYTES = 5 * 1024 * 1024;
const MAX_FRIDGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(?:jpeg|png|gif|webp|avif)$/i;
// Photos are stored in Firestore documents (1 MiB limit), so they are resized
// and re-encoded in the browser before saving.
const TARGET_DATA_URL_LENGTH = 700 * 1024;

function validate(file, maxBytes) {
  if (!file || !IMAGE_TYPES.test(file.type)) {
    throw new Error("이미지 파일(JPG, PNG, GIF, WEBP, AVIF)만 선택할 수 있어요.");
  }
  if (file.size > maxBytes) {
    throw new Error(`이미지는 ${Math.round(maxBytes / 1024 / 1024)}MB 이하만 선택할 수 있어요.`);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("사진을 읽지 못했어요. 다시 선택해주세요."));
    };
    image.src = url;
  });
}

async function compress(file, maxDimension, targetLength = TARGET_DATA_URL_LENGTH) {
  const image = await loadImage(file);
  let dimension = maxDimension;
  let quality = 0.82;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, dimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= targetLength) return { dataUrl, size: Math.round(dataUrl.length * 0.75) };
    dimension = Math.round(dimension * 0.75);
    quality = Math.max(0.55, quality - 0.08);
  }
  throw new Error("사진 용량을 줄이지 못했어요. 다른 사진을 선택해주세요.");
}

export async function readPhoto(file, maxBytes = MAX_FRIDGE_BYTES) {
  validate(file, maxBytes);
  const maxDimension = maxBytes === MAX_PROFILE_BYTES ? 384 : 1280;
  const { dataUrl, size } = await compress(file, maxDimension);
  return { dataUrl, name: file.name, type: "image/jpeg", size };
}

// Higher-resolution copy used only for AI recognition (never stored), so small
// text on receipts, memos and package labels stays legible.
export async function readRecognitionPhoto(file) {
  validate(file, MAX_FRIDGE_BYTES);
  const { dataUrl } = await compress(file, 2048, 2.5 * 1024 * 1024);
  return dataUrl;
}

export const photoLimits = Object.freeze({
  profileBytes: MAX_PROFILE_BYTES,
  fridgeBytes: MAX_FRIDGE_BYTES,
  fridgeCount: 4
});
