/**
 * 省略して表示している本文の中で、要素が隠れているかどうかの判定
 *
 * 証言のカード（ClaimCard）と資料の本文（InterviewTranscript）は、長い本文の下側を省略して表示します。
 * 省略中も本文の中のリンク・ボタンには Tab キーで移れるようにし、隠れている要素に移ったときだけ本文を展開します。
 * 展開しないと、見えない要素にフォーカスがあるうえ、ブラウザが省略した枠の中をスクロールして先頭の行が隠れるためです。
 *
 * 注意: 描画後の位置で判定するため、レイアウトを計算しない環境（jsdom）では、位置を与えてから確かめてください。
 */

/**
 * 要素の下端が、省略した枠（container）の下端より下にはみ出しているかどうかを返します。一部でも隠れていれば true です。
 * ブラウザは、隠れた要素にフォーカスを移すとき、フォーカスのイベントより先に枠の中をスクロールして要素を見せます。
 * そのため、枠のスクロール量（scrollTop）を足し戻し、スクロールする前の位置で判定します。
 */
export function isClippedBelow(element: Element, container: Element): boolean {
  return element.getBoundingClientRect().bottom + container.scrollTop > container.getBoundingClientRect().bottom;
}
