/**
 * 削除の確認ボタン
 *
 * ケース・証言・人物・場所の削除で共有します。削除は取り消せないため、押してすぐには消さず、
 * 確認の画面（AlertDialog）で改めて承認を求めてから onConfirm を呼び出します。
 * 以前はブラウザの window.confirm を使っていましたが、画面の中で完結する確認にそろえました。
 *
 * 注意: 削除できなかった理由（他のデータから参照されているなど）の表示は、呼び出し側が担います。
 * この部品は、承認を取って onConfirm を呼ぶところまでを受け持ちます。
 * 確認の画面は開閉をこの部品が持ちます（制御付き）。shadcn/ui の AlertDialogAction はそれ自体では画面を閉じないため、
 * 承認と同時に閉じないと、呼び出し側が出した「削除できません」の理由が、開いたままの画面の後ろに隠れてしまいます。
 */
'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type DeleteConfirmButtonProps = {
  /** 削除のボタンの名前です（「この人物を削除」など）。 */
  label: string;
  /** 確認の画面の見出しです。何を消そうとしているかが分かる文にしてください。 */
  title: string;
  /** 確認の画面の説明です。取り消せないことを伝えてください。 */
  description: string;
  /** 承認されたときに呼び出します。 */
  onConfirm: () => void;
  /**
   * ゴミ箱のアイコンだけを表示するかどうかです。label が長くなる場所（ケースの一覧の各行）で使います。
   * アイコンだけでも読み上げには label が伝わるよう、ボタンの名前として持たせます。
   */
  iconOnly?: boolean;
};

export function DeleteConfirmButton({ label, title, description, onConfirm, iconOnly }: DeleteConfirmButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleConfirm = () => {
    setIsOpen(false);
    onConfirm();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger
        render={<Button variant={iconOnly ? 'ghost' : 'destructive'} size={iconOnly ? 'icon-sm' : 'sm'} />}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
      >
        <Trash2 className={iconOnly ? 'text-destructive' : undefined} />
        {!iconOnly && label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>やめる</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>削除する</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
