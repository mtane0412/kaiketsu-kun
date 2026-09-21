/**
 * エンティティに登録する画像の縮小
 *
 * 案件データは localStorage の1キーにJSONで保存しており、容量の上限（約5MB）があります。
 * 画像は登録の時点で小さなJPEGに縮小し、data URL として案件データに含めます。
 * 書き出したJSONは、画像を含めて1ファイルで完結します。
 */

/** 縮小後の画像の長辺の上限（ピクセル）です。一覧やカードの小さな表示に十分で、1枚あたり数十KBに収まる大きさです。 */
export const ENTITY_IMAGE_MAX_EDGE = 256;

/** JPEGの品質（0〜1）です。 */
const JPEG_QUALITY = 0.8;

/** 透過部分の背景色です。JPEGは透過を持てず、塗らない場合は黒になります。 */
const BACKGROUND_COLOR = '#ffffff';

type Size = { width: number; height: number };

/** 縦横比を保ったまま、長辺が maxEdge に収まる大きさを返します。拡大はしません。 */
export function fitWithin(size: Size, maxEdge: number): Size {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * 画像ファイルを、長辺 ENTITY_IMAGE_MAX_EDGE 以内のJPEGに縮小し、data URL で返します。
 * 画像でないファイル、画像として読み込めないファイルは例外を投げます。
 */
export async function fileToResizedDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('画像ファイルを選んでください');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (caught) {
    throw new Error('画像を読み込めませんでした。別の画像ファイルを選んでください', { cause: caught });
  }

  try {
    const { width, height } = fitWithin(bitmap, ENTITY_IMAGE_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('画像を縮小できませんでした（canvas を利用できません）');
    }
    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}
