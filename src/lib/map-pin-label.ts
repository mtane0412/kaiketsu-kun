/**
 * 地図のピンに表示するラベル（その場所を述べる証言の順番）の組み立て
 *
 * 地図ビュー（src/components/views/TrailMap.tsx）は、場所ごとに1つのピンを置き、その場所を述べる証言の順番を表示します。
 * 1つの場所に多くの証言がある大きなケースで、すべての順番を並べるとラベルが地図の幅を超えて伸びるため、
 * 表示する順番の数に上限を設けます。
 */

/** ピンのラベルに並べる順番の数の上限です。これを超える場合は、ラベルを短くまとめます。 */
const MAX_LISTED_ORDERS = 3;

/**
 * ピンのラベルの文字列を返します。
 *
 * - 順番が上限以下の場合は、すべての順番を「・」でつなぎます（例「1・3・5」）
 * - 上限を超え、選択中の証言がそのピンにある場合は、選択中の順番とピン内での位置を表示します（例「8（5件中4件目）」）。
 *   ピンを押すたびに同じ場所の次の証言へ切り替わるため、いまどれを見ているかが分かるようにします
 * - 上限を超え、選択中の証言がそのピンにない場合は、先頭の順番と残りの件数を表示します（例「2・4・6 他2件」）
 *
 * @param orders そのピンの場所を述べる証言の順番です（昇順）。
 * @param activeOrder 選択中の証言の順番です。
 */
export function pinLabel(orders: number[], activeOrder: number): string {
  if (orders.length <= MAX_LISTED_ORDERS) return orders.join('・');
  const activeIndex = orders.indexOf(activeOrder);
  if (activeIndex >= 0) return `${activeOrder}（${orders.length}件中${activeIndex + 1}件目）`;
  return `${orders.slice(0, MAX_LISTED_ORDERS).join('・')} 他${orders.length - MAX_LISTED_ORDERS}件`;
}
