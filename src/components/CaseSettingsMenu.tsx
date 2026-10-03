/**
 * ケース設定のメニュー
 *
 * 開いているケースの名前の変更・JSONの書き出し・ケースの削除と、LLM の設定をまとめたメニューです。
 * LLM の設定（OpenRouter の API キーとモデル）はケースごとではなくブラウザごとの設定ですが、証言の候補の抽出（ClaimExtraction）の前に
 * 設定しておけるよう、ここにも置きます。入力欄は抽出の画面と共通です（LlmSettingsFields）。
 * いずれも毎日使う操作ではないため、画面の一等地には置かず、サイドバーの足元のメニューに畳んでいます。
 * ケースの追加（新しいケース・JSONの読み込み・架空のサンプル）は、ケースをまたぐ操作のため、ケースの一覧（CaseList）が担います。
 *
 * 注意: この段階ではスキーマのマイグレーションが無いため、JSONの書き出しが入力済みデータを守る唯一の手段です。
 * ケースの削除は取り消せないため、確認の画面（AlertDialog）で改めて承認を求めます。
 */
'use client';

import { Download, KeyRound, Pencil, Settings, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveLlmSettings, type LlmSettings } from '@/lib/llm-settings';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { FormError } from './forms/fields';
import { findModelError, LlmSettingsFields, loadInitialLlmSettings, useOpenRouterModels } from './LlmSettingsFields';
import { casesHref } from './routes';

/** ケース名の入力欄と、その説明を結び付けるためのIDです。 */
const CASE_NAME_INPUT_ID = 'case-settings-name';

export function CaseSettingsMenu() {
  const currentCase = useCurrentCase();
  const renameCase = useCaseStore((state) => state.renameCase);
  const deleteCase = useCaseStore((state) => state.deleteCase);
  const router = useRouter();

  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingLlmSettings, setIsEditingLlmSettings] = useState(false);
  /** 変更の画面を開いている間の、入力中のケース名です。保存するまで、開いているケースには反映しません。 */
  const [draftName, setDraftName] = useState(currentCase.name);

  const handleOpenRename = () => {
    setDraftName(currentCase.name);
    setIsRenaming(true);
  };

  const handleSubmitRename = (event: FormEvent) => {
    event.preventDefault();
    renameCase(draftName);
    setIsRenaming(false);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(currentCase, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentCase.name}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // 一部のブラウザはダウンロードの開始前にURLが破棄されると失敗するため、破棄は次のタスクまで遅らせる
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleDelete = () => {
    deleteCase(currentCase.id);
    setIsDeleting(false);
    // 削除したケースのURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(casesHref());
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="w-full justify-start" />}>
          <Settings />
          <span>ケース設定</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuItem onClick={handleOpenRename}>
            <Pencil />
            ケース名を変更
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExport}>
            <Download />
            JSONを書き出す
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsEditingLlmSettings(true)}>
            <KeyRound />
            LLM の設定
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setIsDeleting(true)}>
            <Trash2 />
            このケースを削除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogContent>
          <form onSubmit={handleSubmitRename}>
            <DialogHeader>
              <DialogTitle>ケース名を変更</DialogTitle>
              <DialogDescription>このケースの名前を変更します。ケースの一覧にも、この名前で並びます。</DialogDescription>
            </DialogHeader>
            <div className="my-4 grid gap-2">
              <Label htmlFor={CASE_NAME_INPUT_ID}>ケース名</Label>
              <Input
                id={CASE_NAME_INPUT_ID}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRenaming(false)}>
                やめる
              </Button>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditingLlmSettings} onOpenChange={setIsEditingLlmSettings}>
        <DialogContent>
          {/* 開くたびに保存済みの設定を読み直すよう、開いている間だけ入力欄を描画する */}
          {isEditingLlmSettings && <LlmSettingsForm onDone={() => setIsEditingLlmSettings(false)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ケース「{currentCase.name}」を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このケースの証言・人物・場所をすべて削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>やめる</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>削除する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * 「LLM の設定」の画面の中身です。保存すると、証言の候補の抽出で入力済みの状態で使います。
 * API キーを空にして保存すると、保存済みのキーを消せます。モデルの一覧にないモデルは保存しません。
 */
function LlmSettingsForm({ onDone }: { onDone: () => void }) {
  const [initial] = useState(loadInitialLlmSettings);
  const [settings, setSettings] = useState<LlmSettings>(initial.settings);
  const [error, setError] = useState<string | null>(null);
  const modelList = useOpenRouterModels();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const modelError = findModelError(settings.model, modelList);
    if (modelError !== null) {
      setError(modelError);
      return;
    }
    saveLlmSettings({ apiKey: settings.apiKey.trim(), model: settings.model.trim() });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>LLM の設定</DialogTitle>
        <DialogDescription>
          聴取の本文から証言の候補を抽出するときに使う、OpenRouter の API キーとモデルです。API キーを空にして保存すると、保存済みのキーを消せます。
        </DialogDescription>
      </DialogHeader>
      <div className="my-4 space-y-2">
        <FormError message={initial.error} />
        <LlmSettingsFields settings={settings} onChange={setSettings} modelList={modelList} />
        <FormError message={error} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          やめる
        </Button>
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  );
}
