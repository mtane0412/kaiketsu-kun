/**
 * エンティティ（人物・場所）の、小さな丸いアイコン
 *
 * 画像を登録したエンティティは画像を、画像の無い人物は1文字（iconText）を丸の中に表示します。
 * 表示する1文字は src/domain/person-icon.ts で決めます（指定した文字、無ければ名前の先頭の文字）。
 * 画像も文字も無いエンティティ（画像を登録していない場所）には、何も表示しません。
 *
 * 必ずエンティティの名前の隣に置くか、名前を持つ要素（aria-label を付けたボタンなど）で包むため、
 * アイコン自体は装飾として扱います（画像の alt は空、文字は aria-hidden）。
 * アイコンに名前を持たせると、読み上げで名前が二重になり、ボタンのアクセシブルな名前も変わってしまいます。
 * 文字は要素の中身ではなく data-icon-text 属性に持ち、CSS（::before）で描画します。
 * 証言の本文の中に置いても、本文のテキスト（選択してコピーした内容）に余計な1文字が混ざらないようにするためです。
 */
const SIZE_CLASSES = {
  /** 本文のメンションや一覧の行など、文字と並べる大きさです。文中でも名前と詰まらないよう、右に余白を持ちます。 */
  sm: 'mr-0.5 h-4 w-4 text-[0.625rem]',
  /** 証言カードの言及の欄のように、アイコンだけを並べる大きさです。 */
  row: 'h-5 w-5 text-xs',
  /** グループの見出しなど、少し目立たせる大きさです。 */
  md: 'h-7 w-7 text-sm',
} as const;

type EntityAvatarProps = {
  imageDataUrl: string | undefined;
  /** 画像が無い場合に表示する1文字です。人物にだけ渡します。 */
  iconText?: string | undefined;
  size: keyof typeof SIZE_CLASSES;
};

export function EntityAvatar({ imageDataUrl, iconText, size }: EntityAvatarProps) {
  if (imageDataUrl) {
    return (
      // 縮小済みの data URL のため、next/image の最適化は使用しない
      <img src={imageDataUrl} alt="" className={`inline-block shrink-0 rounded-full object-cover align-text-bottom ${SIZE_CLASSES[size]}`} />
    );
  }
  if (!iconText) return null;
  return (
    <span
      aria-hidden="true"
      data-icon-text={iconText}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-sky-600 align-text-bottom font-semibold leading-none text-white before:content-[attr(data-icon-text)] ${SIZE_CLASSES[size]}`}
    />
  );
}
