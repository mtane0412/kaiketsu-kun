/**
 * 人物の種別（Person.kind）ごとの見た目
 *
 * アイコン（EntityAvatar）・グラフのノード・絞り込みの見本の色を、ここに集約します。
 * どこで見ても同じ種別が同じ色になるようにするためです。
 * 色だけに頼らず見分けられるよう、個人以外のアイコンは角の丸い四角にします（形は EntityAvatar が決めます）。
 *
 * 注意: Tailwind CSS がクラス名を抽出できるよう、クラス名は組み立てずに完全な文字列で書きます。
 */
import type { PersonKind } from '@/domain/types';

/** 種別ごとの見た目のクラスです。 */
type PersonKindStyle = {
  /** 画像の無いアイコンの背景と文字の色です。 */
  face: string;
  /** 画像のあるアイコンの縁取りの色です。個人は縁取りをしません。 */
  ring: string;
  /** グラフのノードの丸の塗りと縁の色です。 */
  nodeFill: string;
  /** グラフのノードの丸の中の文字の色です。 */
  nodeText: string;
  /** 画像を登録したグラフのノードの、画像の上に描く縁取りの色です。個人は縁取りをしません。 */
  nodeOutline: string;
};

export const PERSON_KIND_STYLES: Record<PersonKind, PersonKindStyle> = {
  individual: {
    face: 'bg-primary text-primary-foreground',
    ring: '',
    nodeFill: 'fill-primary stroke-background',
    nodeText: 'fill-primary-foreground',
    nodeOutline: '',
  },
  organization: {
    face: 'bg-sky-700 text-white',
    ring: 'ring-2 ring-sky-700',
    nodeFill: 'fill-sky-700 stroke-background',
    nodeText: 'fill-white',
    nodeOutline: 'stroke-sky-700',
  },
  record: {
    face: 'bg-amber-600 text-white',
    ring: 'ring-2 ring-amber-600',
    nodeFill: 'fill-amber-600 stroke-background',
    nodeText: 'fill-white',
    nodeOutline: 'stroke-amber-600',
  },
  object: {
    face: 'bg-emerald-700 text-white',
    ring: 'ring-2 ring-emerald-700',
    nodeFill: 'fill-emerald-700 stroke-background',
    nodeText: 'fill-white',
    nodeOutline: 'stroke-emerald-700',
  },
};

/** アイコンの形です。個人は丸、それ以外は角の丸い四角にします。角の丸みは、小さな大きさでも丸に見えないよう、大きさに対する割合で指定します。 */
export function personKindShapeOf(kind: PersonKind | undefined): string {
  return kind === undefined || kind === 'individual' ? 'rounded-full' : 'rounded-[25%]';
}
