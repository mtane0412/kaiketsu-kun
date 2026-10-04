/**
 * ボードのキーボードショートカット
 *
 * 次のキーを、ボード全体（ページのどこにフォーカスがあっても）で受け付けます。
 * - Esc: 詳細を開いているとき、詳細を閉じて元の表示に戻ります（「閉じる」リンクと同じ動きです）。
 * - 「/」・⌘K（Windows などでは Ctrl+K）: ボード全体の検索窓へフォーカスを移します。
 *
 * 注意:
 * - 入力欄（input・textarea・select・contenteditable）で文字を書いている間は、Esc と「/」を受け付けません。
 *   書きかけの内容を失ったり、「/」を入力できなくなったりしないためです。⌘K は文字を入力しないキーのため、入力中でも受け付けます。
 * - ダイアログ（削除の確認・モバイルのサイドバーなど）を開いている間は受け付けません。Esc はダイアログを閉じるために使うためです。
 * - IMEの変換中（isComposing）のキーは受け付けません。
 */
import { useEffect } from 'react';

type BoardShortcutsOptions = {
  /** 詳細を閉じたときに戻る先のURLです。詳細を開いていないときは undefined を渡します。 */
  closeHref: string | undefined;
  /** 詳細を閉じる（closeHref へ移る）処理です。 */
  onClose: (href: string) => void;
  /** 検索窓へフォーカスを移す処理です。 */
  onFocusSearch: () => void;
};

/** 文字を入力できる要素かどうかを返します。 */
function isEditable(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

/** ダイアログを開いているかどうかを返します。 */
function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

export function useBoardShortcuts({ closeHref, onClose, onFocusSearch }: BoardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isDialogOpen()) return;
      const editing = isEditable(document.activeElement);

      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        onFocusSearch();
        return;
      }
      if (editing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '/') {
        // 「/」を検索語として入力しないよう、既定の動きを止める
        event.preventDefault();
        onFocusSearch();
        return;
      }
      if (event.key === 'Escape' && closeHref !== undefined) {
        event.preventDefault();
        onClose(closeHref);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeHref, onClose, onFocusSearch]);
}
