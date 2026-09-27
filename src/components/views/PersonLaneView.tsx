/**
 * 人物の動きビュー
 *
 * 行に証言（時系列ボードの並び順）、列に人物を取った表で、各人物が発言した証言と言及された証言を並べます。
 * 列を縦に読むと、その人物が、いつ・どこで・何をしていたと語られているかを追えます。
 * 行を横に読むと、1件の証言に誰が関わっているかが分かります。
 * 1件の証言は、関わる人物の数だけ、それぞれの列に同じカードとして現れます。
 * 列ごとに「発言」（本人の発言）か「言及」（他者の発言や推測の中で語られた）かを示し、本人の言い分と周りの証言を見分けられるようにします。
 * 動きを追いやすいよう、カードの上部に述べる場所を示します（ClaimCard の emphasizePlace）。
 *
 * 注意: 列は人物の数だけ増えるため、表は枠の中で縦横にスクロールします。見出しの行（人物）と列（日時）は、
 * スクロールしても見えるよう枠に貼り付けます。枠の高さを画面に収めているのは、縦にスクロールしたときにも人物の見出しを残すためです。
 */
import { useMemo } from 'react';
import { buildPersonLanes, type LaneRole } from '@/domain/case-views';
import { formatTimeRef } from '@/domain/time-ref';
import type { Case } from '@/domain/types';
import { EntityAvatar } from '../EntityAvatar';
import { ClaimCard } from './ClaimCard';

/** 列の人物にとっての証言の役割の表示です。 */
const ROLE_LABELS: Record<LaneRole, string> = { speaker: '発言', mentioned: '言及' };

/** 役割の表示の色です。本人の発言を濃く、言及を控えめにします。 */
const ROLE_STYLES: Record<LaneRole, string> = {
  speaker: 'bg-foreground text-background',
  mentioned: 'border text-muted-foreground',
};

/** 日時を述べない証言の、行の見出しです。 */
const UNKNOWN_WHEN_LABEL = '日時不明';

type PersonLaneViewProps = {
  target: Case;
};

export function PersonLaneView({ target }: PersonLaneViewProps) {
  const { lanes, rows } = useMemo(() => buildPersonLanes(target), [target]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        人物が登場する証言がまだありません。証言の発言者を選ぶか、本文で人物に言及してください。
      </p>
    );
  }

  return (
    // ヘッダー（h-14）と余白のぶんを除いた高さに収め、見出しを枠の上端・左端に貼り付ける
    <div className="max-h-[calc(100svh-6rem)] overflow-auto rounded-lg border">
      <table aria-label="人物の動き" className="border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-30 border-b border-r bg-muted p-2 text-xs font-medium">
              日時
            </th>
            {lanes.map((lane) => (
              <th
                key={lane.personId}
                scope="col"
                className="sticky top-0 z-20 w-64 min-w-64 border-b bg-muted p-2 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  <EntityAvatar imageDataUrl={lane.imageDataUrl} iconText={lane.iconText} size="md" />
                  {lane.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th
                scope="row"
                className="sticky left-0 z-10 w-28 min-w-28 border-b border-r bg-background p-2 align-top text-xs font-medium text-muted-foreground"
              >
                {row.view.claim.when ? formatTimeRef(row.view.claim.when) : UNKNOWN_WHEN_LABEL}
              </th>
              {lanes.map((lane) => {
                const role = row.roles[lane.personId];
                return (
                  <td key={lane.personId} className="border-b p-2 align-top">
                    {role && (
                      <>
                        <span className={`mb-1 inline-block rounded px-1.5 py-0.5 text-xs ${ROLE_STYLES[role]}`}>
                          {ROLE_LABELS[role]}
                        </span>
                        <ul>
                          <ClaimCard view={row.view} showSpeaker={role === 'mentioned'} tab="lanes" emphasizePlace />
                        </ul>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
