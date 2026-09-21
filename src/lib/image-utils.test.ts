/**
 * 画像の切り抜きと縮小（エンティティに登録する画像を data URL にする処理）のテスト
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_IMAGE_MAX_EDGE, fileToResizedDataUrl, fitWithin, isImageFile } from './image-utils';

/** 画像全体を指す切り抜き範囲です（1024×512 の画像を前提にします）。 */
const 画像全体 = { x: 0, y: 0, width: 1024, height: 512 };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fitWithin', () => {
  it('長辺が上限を超える画像は、縦横比を保って上限まで縮小する', () => {
    expect(fitWithin({ width: 1024, height: 512 }, 256)).toEqual({ width: 256, height: 128 });
    expect(fitWithin({ width: 300, height: 1200 }, 256)).toEqual({ width: 64, height: 256 });
  });

  it('上限に収まっている画像は、拡大せずそのままの大きさにする', () => {
    expect(fitWithin({ width: 120, height: 80 }, 256)).toEqual({ width: 120, height: 80 });
  });

  it('極端に細長い画像でも、短辺を1ピクセル未満にしない', () => {
    expect(fitWithin({ width: 4000, height: 2 }, 256)).toEqual({ width: 256, height: 1 });
  });
});

describe('isImageFile', () => {
  it('MIMEタイプが image/ で始まるファイルだけを画像とみなす', () => {
    expect(isImageFile(new File(['画像の中身'], '顔写真.png', { type: 'image/png' }))).toBe(true);
    expect(isImageFile(new File(['本文'], 'メモ.txt', { type: 'text/plain' }))).toBe(false);
  });
});

describe('fileToResizedDataUrl', () => {
  it('画像ファイルを、長辺の上限まで縮小したJPEGの data URL にする', async () => {
    // 前提: jsdom は画像のデコードと canvas の描画を持たないため、ブラウザのAPIを差し替える
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1024, height: 512, close }));
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,縮小済み');

    const 顔写真 = new File(['画像の中身'], '顔写真.png', { type: 'image/png' });
    const dataUrl = await fileToResizedDataUrl(顔写真, 画像全体);

    expect(dataUrl).toBe('data:image/jpeg;base64,縮小済み');
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      1024,
      512,
      0,
      0,
      ENTITY_IMAGE_MAX_EDGE,
      ENTITY_IMAGE_MAX_EDGE / 2,
    );
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', expect.any(Number));
    expect(close).toHaveBeenCalled();
  });

  it('切り抜き範囲を指定すると、その範囲だけを縮小して描画する', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1024, height: 768, close: vi.fn() }));
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,切り抜き済み');

    const 集合写真 = new File(['画像の中身'], '集合写真.png', { type: 'image/png' });
    // 集合写真の中の、顔の周りの正方形（512×512）だけを切り抜く
    const 顔の周り = { x: 100, y: 50, width: 512, height: 512 };
    const dataUrl = await fileToResizedDataUrl(集合写真, 顔の周り);

    expect(dataUrl).toBe('data:image/jpeg;base64,切り抜き済み');
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      100,
      50,
      512,
      512,
      0,
      0,
      ENTITY_IMAGE_MAX_EDGE,
      ENTITY_IMAGE_MAX_EDGE,
    );
  });

  it('画像でないファイルは拒否する', async () => {
    const 文書 = new File(['本文'], 'メモ.txt', { type: 'text/plain' });

    await expect(fileToResizedDataUrl(文書, 画像全体)).rejects.toThrow('画像ファイルを選んでください');
  });

  it('画像として読み込めないファイルは、理由を添えて拒否する', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    const 壊れた画像 = new File(['壊れた中身'], '壊れた画像.png', { type: 'image/png' });

    await expect(fileToResizedDataUrl(壊れた画像, 画像全体)).rejects.toThrow('画像を読み込めませんでした');
  });
});
