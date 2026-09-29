/**
 * ケースのサイドバー
 *
 * ボードの左に常に置き、次の3つを1か所にまとめます。
 * 1. ケースの切り替え（サイドバーの頭）。いま開いているケースの名前を示し、保存済みの他のケースとケースの一覧へ移れます。
 *    その下に、証言・人物・場所を横断して検索する検索窓を置きます。Enterキーで検索結果のページ（.../search?q=）へ移ります。
 *    IMEの変換を確定するEnterキーでは移りません（変換中の文字列で検索してしまわないためです）。
 * 2. 表示の切り替え（時系列・グラフ・証言者別・人物の動き・地図・仮説・未了事項）。以前はボードの上のタブでしたが、ナビゲーションとしてここへ移しました。
 * 3. 登録済みの一覧（人物・場所・証言）。以前はボードを覆うオーバーレイ（EntryPanel）でしたが、
 *    常に見える場所に置き、選ぶとメインのカラムがその詳細に切り替わるようにしました。
 * 足元には、めったに使わない操作（ケース名の変更・JSONの書き出し・ケースの削除）をメニューに畳んでいます（CaseSettingsMenu）。
 *
 * 証言の一覧の下には、裏付ける照合を1件も持たない証言だけを並べた「裏付けの無い証言」を置きます（findUncorroboratedClaims）。
 * どの証言の裏付けがまだ取れていないかを、ボードを見比べ直さずに把握できるようにするためです。
 * その下には、完了していない未了事項だけを並べた「未完了の未了事項」を置き、見出しに件数を示します（buildTaskList）。
 * 確認すべきことがいくつ残っているかを、どの表示からでも把握できるようにするためです。
 *
 * 一覧はどれも折りたためます。証言は数が多くサイドバーを占めてしまうため、最初は折りたたんでおきます。
 * 人物・場所は、見出しの横の「＋」から登録のページ（/cases/<ケースのID>/persons/new・.../places/new）へ進みます。
 * 証言には「＋」を置きません。証言は時系列ボードの書き足したい位置から書くため、並び順の中での位置が決まる入り口に一本化しています。
 *
 * 注意: 一覧のリンクには、いま開いている表示（?tab=）を引き継ぎます。詳細から「ボードに戻る」で元の表示に戻れるようにするためです。
 * 表示の切り替えは、詳細を開いている間も、詳細を閉じてボードへ戻ります。
 * メインのカラムは1つ（ボードか詳細のどちらか一方）のため、押したときに必ずメインのカラムが切り替わるようにするためです。
 * useSearchParams・usePathname を使うため、呼び出し側では Suspense の中に置いてください。
 */
'use client';

import {
  ChevronRight,
  CircleDashed,
  Clock,
  Columns3,
  FolderOpen,
  Layers,
  Lightbulb,
  ListTodo,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Share2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { buildTimeline, claimLabelOf, type ClaimView } from '@/domain/case-views';
import { findUncorroboratedClaims } from '@/domain/cross-checks';
import { personKindSuffixOf } from '@/domain/labels';
import { personIconText } from '@/domain/person-icon';
import { buildTaskList } from '@/domain/tasks';
import type { Id, PersonKind } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { CaseSettingsMenu } from './CaseSettingsMenu';
import { EntityAvatar } from './EntityAvatar';
import {
  boardHref,
  casesHref,
  claimHref,
  newPersonHref,
  newPlaceHref,
  parseTab,
  personHref,
  placeHref,
  SEARCH_QUERY_PARAM,
  searchHref,
  TAB_SEARCH_PARAM,
  TABS,
  taskHref,
  type TabKey,
} from './routes';
import { useCaseId } from './useCaseId';

/** ケースの一覧への導線の表示名です。 */
const CASE_LIST_LABEL = 'ケースの一覧';

/** 表示の切り替え（時系列・グラフ・証言者別・人物の動き・地図・仮説・未了事項）のアイコンです。 */
const TAB_ICONS: Record<TabKey, ReactNode> = {
  timeline: <Clock />,
  graph: <Share2 />,
  speaker: <Users />,
  lanes: <Columns3 />,
  map: <MapPin />,
  hypotheses: <Lightbulb />,
  tasks: <ListTodo />,
};

/**
 * 一覧に表示する1件です。リンク先と、行に表示する名前・アイコンを持ちます。
 * 人物の行は種別（personKind）も持ち、アイコンの色と形で種別を示します。
 * 色と形は読み上げで伝わらないため、人物ではない種別は、名前に添える読み上げ用の表記（「（記録・媒体）」など）でも伝えます。
 */
type ListItem = { id: Id; label: string; href: string; imageDataUrl?: string; iconText?: string; personKind?: PersonKind };

type EntityGroupProps = {
  label: string;
  icon: ReactNode;
  items: ListItem[];
  /** 一覧全体に付ける名前です（「人物の一覧」など）。読み上げと、テストからの参照に使います。 */
  listLabel: string;
  /** 見出しの横の「＋」の、リンク先と名前です。証言には置きません。 */
  addAction?: { href: string; label: string };
  /** 最初から開いておくかどうかです。証言は数が多いため閉じた状態から始めます。 */
  defaultOpen: boolean;
  /** いま詳細を開いている項目を見分けます。 */
  isCurrent: (item: ListItem) => boolean;
  /** 1件も登録が無い場合に示す文です。 */
  emptyMessage: string;
};

/** 行の名前に添える種別の表記です。人物ではない種別の人物の行にだけ返し、それ以外の行には空文字列を返します。 */
function kindSuffixOf(item: ListItem): string {
  return item.personKind === undefined ? '' : personKindSuffixOf(item.personKind);
}

/** 人物・場所・証言の一覧を、折りたためる1つのまとまりとして表示します。 */
function EntityGroup({
  label,
  icon,
  items,
  listLabel,
  addAction,
  defaultOpen,
  isCurrent,
  emptyMessage,
}: EntityGroupProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          // 「＋」は見出しの右端に重ねて置くため、「＋」がある一覧では、折りたたみの印をその分だけ左へ寄せる
          className={`w-full gap-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            addAction ? 'pr-7' : ''
          }`}
        >
          {icon}
          <span>{label}</span>
          <span className="ml-auto tabular-nums">{items.length}</span>
          <ChevronRight className="transition-transform group-data-[panel-open]/collapsible:rotate-90" />
        </SidebarGroupLabel>

        {addAction && (
          <SidebarGroupAction render={<Link href={addAction.href} aria-label={addAction.label} />}>
            <Plus />
          </SidebarGroupAction>
        )}

        <CollapsibleContent>
          <SidebarGroupContent>
            {items.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{emptyMessage}</p>
            ) : (
              <SidebarMenu aria-label={listLabel}>
                {items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      size="sm"
                      isActive={isCurrent(item)}
                      render={
                        <Link
                          href={item.href}
                          aria-current={isCurrent(item) ? 'page' : undefined}
                          title={`${item.label}${kindSuffixOf(item)}`}
                        />
                      }
                    >
                      <EntityAvatar imageDataUrl={item.imageDataUrl} iconText={item.iconText} personKind={item.personKind} size="sm" />
                      <span>
                        {item.label}
                        <span className="sr-only">{kindSuffixOf(item)}</span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

/**
 * ボード全体の検索窓です。Enterキーで、入力した検索語の検索結果のページへ移ります。
 * URLの検索語（?q=）を初期値にします。呼び出し側は、URLの検索語が変わるたびに key を変えて再マウントしてください
 * （ブラウザの「戻る」や、検索結果のページを離れたときに、検索窓の文字列をURLに合わせるためです）。
 * 注意: IMEの変換を確定するEnterキー（isComposing）と、空白だけの検索語では移りません。
 */
function BoardSearchInput({ tab, initialQuery }: { tab: TabKey; initialQuery: string }) {
  const caseId = useCaseId();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === '') return;
    router.push(searchHref(caseId, trimmed, tab));
  };

  return (
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50" />
      <SidebarInput
        type="search"
        aria-label="ボード全体を検索"
        placeholder="証言・人物・場所を検索"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        className="pl-8"
      />
    </div>
  );
}

export function CaseSidebar() {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const summaries = useCaseStore((state) => state.summaries);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get(TAB_SEARCH_PARAM));
  const searchQuery = searchParams.get(SEARCH_QUERY_PARAM) ?? '';

  /** 一覧の行が、いま開いている詳細かどうかを判定します。リンク先のうち、クエリを除いた部分で見分けます。 */
  const isCurrentHref = (href: string) => href.split('?')[0] === pathname;

  const timeline = useMemo(() => buildTimeline(currentCase), [currentCase]);

  const personItems: ListItem[] = currentCase.persons.map((person) => ({
    id: person.id,
    label: person.name,
    href: personHref(caseId, person.id, tab),
    imageDataUrl: person.imageDataUrl,
    iconText: personIconText(person),
    personKind: person.kind,
  }));

  const placeItems: ListItem[] = currentCase.places.map((place) => ({
    id: place.id,
    label: place.name,
    href: placeHref(caseId, place.id, tab),
    imageDataUrl: place.imageDataUrl,
  }));

  const uncorroboratedClaims = useMemo(() => findUncorroboratedClaims(currentCase), [currentCase]);

  const toClaimItem = (view: ClaimView): ListItem => ({
    id: view.claim.id,
    label: claimLabelOf(view),
    href: claimHref(caseId, view.claim.id, tab),
  });

  // 証言は、ボードで見える順番（時系列ボードの並び順）と同じ順に並べる
  const claimItems: ListItem[] = timeline.items.map((item) => toClaimItem(item.view));
  const uncorroboratedItems: ListItem[] = uncorroboratedClaims.map(toClaimItem);

  const openTasks = useMemo(() => buildTaskList(currentCase).open, [currentCase]);
  const openTaskItems: ListItem[] = openTasks.map(({ task }) => ({
    id: task.id,
    label: task.content,
    href: taskHref(caseId, task.id, tab),
  }));

  /** ケースの切り替えの候補です。いま開いているケースは、切り替え先には並べません。 */
  const otherCases = summaries.filter((summary) => summary.id !== currentCase.id);

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <FolderOpen />
                <span className="font-medium">{currentCase.name}</span>
                <Layers className="ml-auto" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {otherCases.map((summary) => (
                  <DropdownMenuItem key={summary.id} render={<Link href={boardHref(summary.id, 'timeline')} />}>
                    <FolderOpen />
                    <span className="truncate">{summary.name}</span>
                  </DropdownMenuItem>
                ))}
                {otherCases.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem render={<Link href={casesHref()} />}>
                  <Layers />
                  {CASE_LIST_LABEL}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <BoardSearchInput key={searchQuery} tab={tab} initialQuery={searchQuery} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="表示の切り替え">
              {TABS.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={item.key === tab}
                    render={
                      <Link
                        href={boardHref(caseId, item.key)}
                        aria-current={item.key === tab ? 'page' : undefined}
                      />
                    }
                  >
                    {TAB_ICONS[item.key]}
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <EntityGroup
          label="人物"
          icon={<Users />}
          items={personItems}
          listLabel="人物の一覧"
          addAction={{ href: newPersonHref(caseId, tab), label: '人物を登録' }}
          defaultOpen
          isCurrent={(item) => isCurrentHref(item.href)}
          emptyMessage="まだ登録されていません。"
        />

        <EntityGroup
          label="場所"
          icon={<MapPin />}
          items={placeItems}
          listLabel="場所の一覧"
          addAction={{ href: newPlaceHref(caseId, tab), label: '場所を登録' }}
          defaultOpen
          isCurrent={(item) => isCurrentHref(item.href)}
          emptyMessage="まだ登録されていません。"
        />

        <EntityGroup
          label="証言"
          icon={<MessageSquare />}
          items={claimItems}
          listLabel="証言の一覧"
          defaultOpen={false}
          isCurrent={(item) => isCurrentHref(item.href)}
          emptyMessage="ボードの「ここに書き足す」から書けます。"
        />

        <EntityGroup
          label="裏付けの無い証言"
          icon={<CircleDashed />}
          items={uncorroboratedItems}
          listLabel="裏付けの無い証言の一覧"
          defaultOpen={false}
          isCurrent={(item) => isCurrentHref(item.href)}
          emptyMessage="すべての証言に裏付けの照合があります。"
        />

        <EntityGroup
          label="未完了の未了事項"
          icon={<ListTodo />}
          items={openTaskItems}
          listLabel="未完了の未了事項の一覧"
          defaultOpen={false}
          isCurrent={(item) => isCurrentHref(item.href)}
          emptyMessage="確認すべきことは残っていません。"
        />
      </SidebarContent>

      <SidebarFooter>
        <CaseSettingsMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
