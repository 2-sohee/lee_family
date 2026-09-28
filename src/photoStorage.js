const MAX_PROFILE_BYTES = 5 * 1024 * 1024;
const MAX_FRIDGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(?:jpeg|png|gif|webp|avif)$/i;

function validate(file, maxBytes) {
  if (!file || !IMAGE_TYPES.test(file.type)) {
    throw new Error("이미지 파일(JPG, PNG, GIF, WEBP, AVIF)만 선택할 수 있어요.");
  }
  if (file.size > maxBytes) {
    throw new Error(`이미지는 ${Math.round(maxBytes / 1024 / 1024)}MB 이하만 선택할 수 있어요.`);
  }
}

export function readPhoto(file, maxBytes = MAX_FRIDGE_BYTES) {
  validate(file, maxBytes);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      dataUrl: String(reader.result),
      name: file.name,
      type: file.type,
      size: file.size
    });
    reader.onerror = () => reject(new Error("사진을 읽지 못했어요. 다시 선택해주세요."));
    reader.readAsDataURL(file);
  });
}

export const photoLimits = Object.freeze({
  profileBytes: MAX_PROFILE_BYTES,
  fridgeBytes: MAX_FRIDGE_BYTES,
  fridgeCount: 4
});
