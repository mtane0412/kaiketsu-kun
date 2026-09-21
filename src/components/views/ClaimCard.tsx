/**
 * 証言1件の表示
 *
 * 時系列ビューと証言者別ビューで共有します。
 * ユーザーの推測は、人物の発言と見分けられるよう破線の枠と「推測」の表示で区別します。
 * 本文のメンションは、種類ごとに色分けして「@現在の名前」の形で表示します。
 * 発言者と本文のメンションには、エンティティのアイコン（登録した画像。画像の無い人物は1文字）を添えます。
 * 言及している人物は、名前を並べる代わりにアイコンを並べます（名前はアイコンの説明とツールチップで示します）。
 * 見出しのある証言は、見出しを表示し、本文は「本文を表示」を開くまで折りたたみます（長い本文がボードを占めないようにするためです）。
 * カード全体が、証言の詳細ページ（href）へのリンクになります。証言の編集は詳細ページに一本化しているため、カードには編集のボタンを置きません。
 * onOpenEntity を渡すとメンションと言及のアイコンがボタンになります。
 *
 * 注意: リンクの当たり判定をカード全体に広げています（リンクの after 疑似要素）。カードの中で操作できる要素
 * （メンション・言及のアイコン・「本文を表示」）は、リンクより手前（ABOVE_CARD_LINK）に置いてください。
 */
import Link from 'next/link';
import { claimLabelOf, formatViaLabel, type ClaimView } from '@/domain/case-views';
import type { MentionKind } from '@/domain/mention';
import { personIconText } from '@/domain/person-icon';
import type { Id } from '@/domain/types';
import { EntityAvatar } from '../EntityAvatar';

const MENTION_STYLES: Record<MentionKind, string> = {
  person: 'bg-sky-100 text-sky-800',
  place: 'bg-emerald-100 text-emerald-800',
};

/** カード全体に広げたリンクの当たり判定より手前に置く要素のクラスです。 */
const ABOVE_CARD_LINK = 'relative z-10';

type ClaimCardProps = {
  view: ClaimView;
  /** 発言者名を表示するかどうかです。証言者別ビューではグループ見出しと重複するため非表示にします。 */
  showSpeaker: boolean;
  /** 本文のメンション、または言及の欄のアイコンが選ばれたときに呼び出します。エンティティの編集を開く導線です。 */
  onOpenEntity?: (kind: MentionKind, id: Id) => void;
  /** 証言の詳細ページのURLです。 */
  href: string;
};

export function ClaimCard({ view, showSpeaker, onOpenEntity, href }: ClaimCardProps) {
  const { claim } = view;
  const isUserSpeculation = claim.speaker.kind === 'user';
  const content = (
    <p className="whitespace-pre-line text-slate-900">
      {view.contentSegments.map((segment, index) =>
        segment.type !== 'mention' ? (
          segment.text
        ) : onOpenEntity ? (
          <button
            key={index}
            type="button"
            onClick={() => onOpenEntity(segment.kind, segment.id)}
            className={`${ABOVE_CARD_LINK} rounded px-0.5 hover:underline ${MENTION_STYLES[segment.kind]}`}
          >
            <EntityAvatar imageDataUrl={segment.imageDataUrl} iconText={segment.iconText} size="sm" />@{segment.label}
          </button>
        ) : (
          <span key={index} className={`rounded px-0.5 ${MENTION_STYLES[segment.kind]}`}>
            <EntityAvatar imageDataUrl={segment.imageDataUrl} iconText={segment.iconText} size="sm" />@{segment.label}
          </span>
        )
      )}
    </p>
  );

  return (
    <li
      className={`relative rounded border p-3 text-sm hover:border-sky-400 ${
        isUserSpeculation ? 'border-dashed border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
        {isUserSpeculation && <span className="rounded bg-violet-200 px-1.5 py-0.5 font-medium text-violet-800">推測</span>}
        {showSpeaker &&
          view.speakerPersons.map((person) => (
            <EntityAvatar key={person.id} imageDataUrl={person.imageDataUrl} iconText={personIconText(person)} size="sm" />
          ))}
        {showSpeaker && <span className="font-semibold text-slate-800">{view.speakerLabel}</span>}
        {view.viaPersons.length > 0 && (
          <span className="text-slate-500">{formatViaLabel(view.viaPersons.map((person) => person.name))}</span>
        )}
        <Link
          href={href}
          aria-label={`「${claimLabelOf(view)}」を開く`}
          className="ml-auto text-sky-700 after:absolute after:inset-0 hover:underline"
        >
          開く
        </Link>
      </div>

      {claim.title ? (
        <>
          <p className="font-semibold text-slate-900">{claim.title}</p>
          <details className={`${ABOVE_CARD_LINK} mt-1`}>
            <summary className="cursor-pointer text-xs text-slate-500">本文を表示</summary>
            <div className="mt-1">{content}</div>
          </details>
        </>
      ) : (
        content
      )}

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-slate-500">
        {claim.when && (
          <>
            <dt>述べる日時</dt>
            <dd>{claim.when.text}</dd>
          </>
        )}
        {view.place && (
          <>
            <dt>述べる場所</dt>
            <dd>{view.place.name}</dd>
          </>
        )}
        {view.mentionedPersons.length > 0 && (
          <>
            <dt>言及</dt>
            <dd>
              <ul aria-label="言及している人物" className="flex flex-wrap gap-1">
                {view.mentionedPersons.map((person) => {
                  const avatar = <EntityAvatar imageDataUrl={person.imageDataUrl} iconText={personIconText(person)} size="row" />;
                  return (
                    <li key={person.id} className="flex">
                      {onOpenEntity ? (
                        <button
                          type="button"
                          aria-label={person.name}
                          title={person.name}
                          onClick={() => onOpenEntity('person', person.id)}
                          className={`${ABOVE_CARD_LINK} flex rounded-full hover:ring-2 hover:ring-sky-300`}
                        >
                          {avatar}
                        </button>
                      ) : (
                        <span role="img" aria-label={person.name} title={person.name} className="flex">
                          {avatar}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </dd>
          </>
        )}
        {claim.locator && (
          <>
            <dt>資料内の位置</dt>
            <dd>{claim.locator}</dd>
          </>
        )}
        {claim.statedAt && (
          <>
            <dt>述べた時点</dt>
            <dd>{claim.statedAt.text}</dd>
          </>
        )}
      </dl>
    </li>
  );
}
