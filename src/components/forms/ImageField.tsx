/**
 * 画像の入力欄（アバター風の表示・ファイルの選択・クリップボードからの貼り付け・切り抜き）
 *
 * 画像は、ファイルの選択、キーボードでの貼り付け（Ctrl+V / ⌘+V）、「クリップボードから貼り付け」ボタンの
 * いずれかで受け取ります。受け取った画像は、必ず切り抜きの画面を通してから登録します。
 * 登録した画像は丸く表示するため（EntityAvatar）、切り抜きの範囲も丸で示します。
 */
'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { fileToResizedDataUrl, isImageFile } from '@/lib/image-utils';
import { FormError, LABEL_CLASS } from './fields';

/** 切り抜きの画面の拡大率の範囲と、スライダーの刻みです。 */
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.01;

const SUB_BUTTON_CLASS = 'rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50';

type ImageFieldProps = {
  label: string;
  /** 登録する画像（切り抜いて縮小済みの data URL）です。画像が無い場合は undefined です。 */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
};

/**
 * ラベル付きの画像の入力欄です。
 * 受け取った画像は、切り抜いて縮小した data URL にして onChange に渡し、丸いプレビューを表示します。
 * 画像として扱えない場合は、理由を欄の下に表示し、値を変えません。
 *
 * 注意: 表示している間は、ページ全体への画像の貼り付けを受け取ります。文字だけの貼り付けには干渉しません。
 */
export function ImageField({ label, value, onChange }: ImageFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  /** 切り抜きの画面に出している画像です。切り抜きの画面を出していない場合は null です。 */
  const [croppingFile, setCroppingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCrop = (file: File) => {
    if (!isImageFile(file)) {
      setError('画像ファイルを選んでください');
      return;
    }
    setError(null);
    setCroppingFile(file);
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find(isImageFile);
      // 画像を含まない貼り付け（テキスト欄への文字の貼り付けなど）は、ブラウザの通常の動作に任せる
      if (!file) return;
      event.preventDefault();
      setError(null);
      setCroppingFile(file);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても change イベントが発生するようにする
    event.target.value = '';
    if (file) startCrop(file);
  };

  const handlePasteFromClipboard = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((candidate) => candidate.startsWith('image/'));
        if (!type) continue;
        startCrop(new File([await item.getType(type)], 'クリップボードの画像', { type }));
        return;
      }
    } catch {
      // 読み取りの許可が無い場合や、ブラウザが対応していない場合。キーボードでの貼り付けは許可なしで使用できる
      setError('クリップボードを読み取れませんでした。Ctrl+V（Mac は ⌘+V）での貼り付けをお試しください');
      return;
    }
    setError('クリップボードに画像がありません');
  };

  const handleCropConfirm = async (file: File, area: Area) => {
    try {
      onChange(await fileToResizedDataUrl(file, area));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    setCroppingFile(null);
  };

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input ref={inputRef} id={id} type="file" accept="image/*" onChange={handleSelect} className="sr-only" tabIndex={-1} />
      {croppingFile ? (
        <ImageCropper
          file={croppingFile}
          onConfirm={(area) => handleCropConfirm(croppingFile, area)}
          onCancel={() => setCroppingFile(null)}
          onLoadError={() => {
            setError('画像を読み込めませんでした。別の画像ファイルを選んでください');
            setCroppingFile(null);
          }}
        />
      ) : (
        <div className="flex items-center gap-3">
          <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-300 bg-slate-100">
            {value ? (
              // 縮小済みの data URL のため、next/image の最適化は使用しない
              <img src={value} alt="登録する画像" className="h-full w-full object-cover" />
            ) : (
              <PlaceholderIcon />
            )}
            {/* アバター全体を覆うボタン。ポインターを重ねるかフォーカスすると、カメラのアイコンを表示する */}
            <button
              type="button"
              aria-label="画像を選ぶ"
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/50 text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            >
              <CameraIcon />
            </button>
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => inputRef.current?.click()} className={SUB_BUTTON_CLASS}>
                ファイルを選ぶ
              </button>
              <button type="button" onClick={handlePasteFromClipboard} className={SUB_BUTTON_CLASS}>
                クリップボードから貼り付け
              </button>
              {value && (
                <button type="button" onClick={() => onChange(undefined)} className="px-1 py-1 text-xs text-red-600 hover:underline">
                  画像を削除
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">コピーした画像は、Ctrl+V（Mac は ⌘+V）でも貼り付けできます。</p>
          </div>
        </div>
      )}
      <FormError message={error} />
    </div>
  );
}

type ImageCropperProps = {
  file: File;
  /** 切り抜き範囲（単位は元の画像のピクセル）を受け取ります。 */
  onConfirm: (area: Area) => void;
  onCancel: () => void;
  /** ブラウザが画像を表示できなかった場合（中身が壊れているファイルなど）に呼びます。 */
  onLoadError: () => void;
};

/** 切り抜きの画面です。画像をドラッグして位置を、スライダーかホイールで拡大率を決めます。 */
function ImageCropper({ file, onConfirm, onCancel, onLoadError }: ImageCropperProps) {
  const zoomId = useId();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area | null>(null);

  // 切り抜きの画面に渡すURLを発行し、画面を閉じるときに破棄する
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="space-y-2">
      <div className="relative h-56 overflow-hidden rounded bg-slate-900">
        {imageUrl && (
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            // 操作の終了時だけでなく、範囲が変わるたびに受け取る（終了の通知が来なくても、表示中の範囲で登録するため）
            onCropAreaChange={(_percentages, pixels) => setArea(pixels)}
            mediaProps={{ onError: onLoadError }}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={zoomId} className="shrink-0 text-xs text-slate-600">
          拡大
        </label>
        <input
          id={zoomId}
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!area}
          onClick={() => area && onConfirm(area)}
          className="rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          この範囲で登録
        </button>
        <button type="button" onClick={onCancel} className={SUB_BUTTON_CLASS}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

/** 画像を登録していない場合に表示する、人影のアイコンです。 */
function PlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-slate-300">
      <circle cx="12" cy="9" r="4" />
      <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
      <path d="M9 4 7.5 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L15 4zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
    </svg>
  );
}
