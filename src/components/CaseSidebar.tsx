/**
 * ケースのサイドバー
 *
 * ボードの左に常に置き、次の3つを1か所にまとめます。
 * 1. ケースの切り替え（サイドバーの頭）。いま開いているケースの名前を示し、保存済みの他のケースとケースの一覧へ移れます。
 * 2. 表示の切り替え（時系列・証言者別・地図）。以前はボードの上のタブでしたが、ナビゲーションとしてここへ移しました。
 * 3. 登録済みの一覧（人物・場所・証言）。以前はボードを覆うオーバーレイ（EntryPanel）でしたが、
 *    常に見える場所に置き、選ぶとボードの横の詳細ペインが開くようにしました。
 * 足元には、めったに使わない操作（ケース名の変更・JSONの書き出し・ケースの削除）をメニューに畳んでいます（CaseSettingsMenu）。
 *
 * 一覧はどれも折りたためます。証言は数が多くサイドバーを占めてしまうため、最初は折りたたんでおきます。
 * 人物・場所は、見出しの横の「＋」から登録のページ（/cases/<ケースのID>/new/person・.../new/place）へ進みます。
 * 証言には「＋」を置きません。証言は時系列ボードの書き足したい位置から書くため、並び順の中での位置が決まる入り口に一本化しています。
 *
 * 注意: 一覧のリンクには、いま開いている表示（?tab=）を引き継ぎます。詳細から「ボードに戻る」で元の表示に戻れるようにするためです。
 * 詳細を開いている間、表示の切り替えは、詳細を開いたままのURL（withTab）へ移ります。
 * useSearchParams・usePathname を使うため、呼び出し側では Suspense の中に置いてください。
 */
'use client';

import { ChevronRight, Clock, FolderOpen, Layers, MapPin, MessageSquare, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { buildTimeline, claimLabelOf } from '@/domain/case-views';
import { personIconText } from '@/domain/person-icon';
import type { Id } from '@/domain/types';
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
  parseDetailKind,
  parseTab,
  personHref,
  placeHref,
  TAB_SEARCH_PARAM,
  TABS,
  withTab,
  type TabKey,
} from './routes';
import { useCaseId } from './useCaseId';

/** ケースの一覧への導線の表示名です。 */
const CASE_LIST_LABEL = 'ケースの一覧';

/** 表示の切り替え（時系列・証言者別・地図）のアイコンです。 */
const TAB_ICONS: Record<TabKey, ReactNode> = {
  timeline: <Clock />,
  speaker: <Users />,
  map: <MapPin />,
};

/** 一覧に表示する1件です。リンク先と、行に表示する名前・アイコンを持ちます。 */
type ListItem = { id: Id; label: string; href: string; imageDataUrl?: string; iconText?: string };

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
                        <Link href={item.href} aria-current={isCurrent(item) ? 'page' : undefined} title={item.label} />
                      }
                    >
                      <EntityAvatar imageDataUrl={item.imageDataUrl} iconText={item.iconText} size="sm" />
                      <span>{item.label}</span>
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

export function CaseSidebar() {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const summaries = useCaseStore((state) => state.summaries);
  const pathname = usePathname();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));

  /** 詳細を開いている場合は、表示を切り替えても詳細を閉じないよう、いまのパスにタブだけを付け替えます。 */
  const isDetailOpen = parseDetailKind(pathname) !== undefined;
  /** 一覧の行が、いま開いている詳細かどうかを判定します。リンク先のうち、クエリを除いた部分で見分けます。 */
  const isCurrentHref = (href: string) => href.split('?')[0] === pathname;

  const timeline = useMemo(() => buildTimeline(currentCase), [currentCase]);

  const personItems: ListItem[] = currentCase.persons.map((person) => ({
    id: person.id,
    label: person.name,
    href: personHref(caseId, person.id, tab),
    imageDataUrl: person.imageDataUrl,
    iconText: personIconText(person),
  }));

  const placeItems: ListItem[] = currentCase.places.map((place) => ({
    id: place.id,
    label: place.name,
    href: placeHref(caseId, place.id, tab),
    imageDataUrl: place.imageDataUrl,
  }));

  // 証言は、ボードで見える順番（時系列ボードの並び順）と同じ順に並べる
  const claimItems: ListItem[] = timeline.items.map((item) => ({
    id: item.view.claim.id,
    label: claimLabelOf(item.view),
    href: claimHref(caseId, item.view.claim.id, tab),
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
                        href={isDetailOpen ? withTab(pathname, item.key) : boardHref(caseId, item.key)}
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
      </SidebarContent>

      <SidebarFooter>
        <CaseSettingsMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
