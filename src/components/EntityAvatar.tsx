/**
 * エンティティ（人物・場所）に登録した画像の、小さな丸い表示
 *
 * 必ずエンティティの名前の隣に置くため、画像は装飾として扱います（alt は空）。
 * 名前を画像の代替テキストにすると、読み上げで名前が二重になり、ボタンのアクセシブルな名前も変わってしまいます。
 * 画像を登録していないエンティティには、何も表示しません。
 */
const SIZE_CLASSES = {
  /** 本文のメンションや一覧の行など、文字と並べる大きさです。文中でも名前と詰まらないよう、右に余白を持ちます。 */
  sm: 'mr-0.5 h-4 w-4',
  /** グループの見出しなど、少し目立たせる大きさです。 */
  md: 'h-7 w-7',
} as const;

type EntityAvatarProps = {
  imageDataUrl: string | undefined;
  size: keyof typeof SIZE_CLASSES;
};

export function EntityAvatar({ imageDataUrl, size }: EntityAvatarProps) {
  if (!imageDataUrl) return null;
  return (
    // 縮小済みの data URL のため、next/image の最適化は使用しない
    <img src={imageDataUrl} alt="" className={`inline-block shrink-0 rounded-full object-cover align-text-bottom ${SIZE_CLASSES[size]}`} />
  );
}
