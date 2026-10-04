/**
 * ケースのJSONファイルを検証するコマンド
 *
 * 使い方: npm run validate-case -- <JSONファイルのパス>...
 *
 * アプリの「JSONを読み込む」で受け付けられ、かつ読み込みの前後でデータが変わらない（現在の形式のまま書かれている）ことを確かめます。
 * 検証の内容は src/lib/case-file-validation.ts を参照してください。
 * すべてのファイルを受け付けた場合は終了コード0、1件でも受け付けない場合は終了コード1で終わります。
 */
import { readFileSync } from 'node:fs';
import { validateCaseFile } from '../src/lib/case-file-validation';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('使い方: npm run validate-case -- <JSONファイルのパス>...');
  process.exit(1);
}

let hasFailure = false;
for (const path of paths) {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    // 読めないファイルがあっても、残りのファイルの検証は続ける
    hasFailure = true;
    console.error(`NG ${path}\n  ファイルを読めません: ${(error as Error).message}`);
    continue;
  }
  const result = validateCaseFile(text);
  if (result.ok) {
    console.log(`OK ${path}\n  ${result.summary}`);
  } else {
    hasFailure = true;
    console.error(`NG ${path}\n${result.errors.map((error) => `  ${error}`).join('\n')}`);
  }
}
process.exit(hasFailure ? 1 : 0);
