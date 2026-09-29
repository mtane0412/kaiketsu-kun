/**
 * 人物の動きビューで、列の人物にとっての証言の役割（発言・言及）を示す表示名と色
 *
 * 証言の順の表（PersonLaneView.tsx）と時刻軸（PersonTimeAxisView.tsx）で、同じ見た目にそろえるために共有します。
 */
import type { LaneRole } from '@/domain/case-views';

/** 列の人物にとっての証言の役割の表示です。 */
export const ROLE_LABELS: Record<LaneRole, string> = { speaker: '発言', mentioned: '言及' };

/** 役割の表示の色です。本人の発言を濃く、言及を控えめにします。 */
export const ROLE_STYLES: Record<LaneRole, string> = {
  speaker: 'bg-foreground text-background',
  mentioned: 'border bg-background text-muted-foreground',
};
