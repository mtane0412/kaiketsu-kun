/**
 * 時系列ビュー
 *
 * 出来事の束と、出来事に束ねていない主張を、主張が述べる日時の早い順に縦に並べます。
 * 出来事の見出しには、束ねた主張から導出した日時・場所・言及されている人物を表示し、
 * 同じ出来事に束ねた他の主張と食い違う主張には食い違いの表示を付けます。
 * 並べるための日時を持たない項目は、末尾の「時期不明」の枠にまとめます。
 */
import { useMemo } from 'react';
import { buildTimeline, type TimelineItem } from '@/domain/case-views';
import type { Case } from '@/domain/types';
import { ClaimCard } from './ClaimCard';

const UNDATED_LABEL = '時期不明';

/** ボードの1項目（出来事の束、または出来事に束ねていない主張）を表示します。 */
function TimelineItemView({ item }: { item: TimelineItem }) {
  if (item.kind === 'claim') {
    return (
      <li>
        <p className="mb-1 text-xs font-medium text-sky-700">{item.when?.text ?? UNDATED_LABEL}</p>
        <ul>
          <ClaimCard view={item.view} showSpeaker showEvent={false} />
        </ul>
      </li>
    );
  }

  return (
    <li>
      <article aria-label={item.event.title}>
        <header className="mb-2">
          <p className="text-xs font-medium text-sky-700">{item.when?.text ?? UNDATED_LABEL}</p>
          <h3 className="text-base font-semibold text-slate-900">{item.event.title}</h3>
          <p className="text-xs text-slate-500">
            {[
              item.places.map((place) => place.name).join('、'),
              item.persons.map((person) => person.name).join('、'),
            ]
              .filter(Boolean)
              .join(' ／ ')}
          </p>
          {item.event.description && <p className="mt-1 text-sm text-slate-700">{item.event.description}</p>}
        </header>
        {item.claims.length === 0 ? (
          <p className="text-xs text-slate-400">この出来事についての主張はまだありません。</p>
        ) : (
          <ul className="space-y-2">
            {item.claims.map((view) => (
              <ClaimCard key={view.claim.id} view={view} showSpeaker showEvent={false} />
            ))}
          </ul>
        )}
      </article>
    </li>
  );
}

/** ボードの項目を一意に識別するキーを返します。 */
function keyOf(item: TimelineItem): string {
  return item.kind === 'event' ? `event:${item.event.id}` : `claim:${item.view.claim.id}`;
}

export function TimelineView({ target }: { target: Case }) {
  const timeline = useMemo(() => buildTimeline(target), [target]);

  if (timeline.items.length === 0 && timeline.undatedItems.length === 0) {
    return <p className="text-sm text-slate-500">主張がまだ登録されていません。「入力」タブから登録してください。</p>;
  }

  return (
    <div className="space-y-6">
      <ol aria-label="時系列" className="space-y-4 border-l-2 border-slate-200 pl-4">
        {timeline.items.map((item) => (
          <TimelineItemView key={keyOf(item)} item={item} />
        ))}
      </ol>

      {timeline.undatedItems.length > 0 && (
        <section aria-label={UNDATED_LABEL}>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{UNDATED_LABEL}</h3>
          <ul className="space-y-4">
            {timeline.undatedItems.map((item) => (
              <TimelineItemView key={keyOf(item)} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
