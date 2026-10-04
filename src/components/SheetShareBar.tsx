"use client";
// 기록지 위 공동 편집 막대(개인전·단체전 공통). lib/sharedSheet.ts 의 useSheetDoc 상태를 보여준다.
// - 혼자 편집: '공동 편집' 버튼(SheetShareButton) → 지금까지 적은 내용으로 공동 기록지를 만들고 링크 팝업을 연다(누르면 복사).
//   이 기기에서 최근에 공동 편집한 기록지가 있으면 '이어서 편집' 목록을 보여준다.
// - 공동 편집 중: 접속 중인 회원 닉네임, '링크 보기', '혼자 편집으로 전환', '기록지 나가기'.
//   다른 메뉴를 누르면 나가기 확인 팝업(useSheetDoc 이 링크 클릭을 가로챔).
// - 로그인 안 한 사람이 링크로 들어오면 로그인 안내(로그인 후 같은 기록지로 돌아옴), 없는 링크면 안내 + 새 기록지.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Copy, History, Link2, LogIn, LogOut, Users } from "lucide-react";
import { Button } from "./ui/button";
import { Confirm, Modal } from "./ui/modal";
import { recentSheets, type RecentSheet, type useSheetDoc } from "@/lib/sharedSheet";

type Sheet = ReturnType<typeof useSheetDoc>;

export function SheetShareButton({ onShare }: { onShare: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onShare} title="링크를 만들어 다른 회원과 이 기록지를 실시간으로 함께 편집해요">
      <Users size={14} />공동 편집
    </Button>
  );
}

/** 공동 편집 상태 막대 + 링크 팝업 + 나가기 확인. 기록지 본문은 mode 가 local·live 일 때만 그린다 */
export function SheetShareBar({ sheet, kind }: { sheet: Sheet; kind: "pool" | "team" }) {
  const pathname = usePathname();
  const [confirmExit, setConfirmExit] = useState(false);
  const { mode, members } = sheet;
  // 링크 칸이나 '링크 복사'를 누르면 복사하고 팝업을 닫는다
  const copyAndClose = () => { sheet.copyLink(); sheet.setLinkOpen(false); };

  const dialogs = (
    <>
      <Modal open={sheet.linkOpen && mode === "live"} onClose={() => sheet.setLinkOpen(false)} title="공동 편집 링크">
        <div className="space-y-3 text-sm">
          <p className="text-muted">이 링크로 들어온 <b className="text-foreground">유펜 회원</b>은 이 기록지를 함께 보고 실시간으로 편집할 수 있어요. 링크를 눌러 복사한 뒤 함께 편집할 회원에게 보내 주세요.</p>
          <button
            type="button"
            onClick={copyAndClose}
            title="눌러서 복사"
            className="block w-full break-all rounded-md border border-brand/40 bg-brand/[0.06] px-3 py-2.5 text-left font-mono text-xs text-foreground hover:bg-brand/[0.12]"
          >
            {sheet.link}
          </button>
          <p className="text-xs text-muted">5일 동안 아무도 수정하지 않으면 공동 기록지는 자동으로 삭제돼요.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => sheet.setLinkOpen(false)}>닫기</Button>
            <Button className="flex-1" onClick={copyAndClose}><Copy size={14} />링크 복사</Button>
          </div>
        </div>
      </Modal>
      <Confirm
        open={!!sheet.leaveTo}
        message="공동 편집 중인 기록지에서 나갈까요? 링크나 기록지 화면의 '최근 공동 편집' 목록으로 다시 들어올 수 있어요."
        okText="나가기"
        onOk={sheet.confirmLeave}
        onCancel={sheet.cancelLeave}
      />
      <Confirm
        open={confirmExit}
        message="이 공동 기록지에서 나가 빈 기록지로 돌아갈까요? 공동 기록지는 그대로 남아 링크나 '최근 공동 편집' 목록으로 다시 들어올 수 있어요."
        okText="나가기"
        onOk={() => { setConfirmExit(false); sheet.exitShare(); }}
        onCancel={() => setConfirmExit(false)}
      />
    </>
  );

  if (mode === "local") return <RecentList kind={kind} />;
  if (mode === "loading") return <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">공동 편집 기록지를 불러오는 중…</p>;
  if (mode === "login") {
    const next = typeof window === "undefined" ? pathname : `${pathname}${window.location.search}`;
    return (
      <div className="rounded-lg border border-brand/30 bg-brand/[0.06] p-4 text-sm">
        <p className="font-semibold">공동 편집 기록지예요</p>
        <p className="mt-1 text-muted">로그인한 회원만 함께 편집할 수 있어요. 로그인하면 이 기록지로 돌아와요.</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-semibold text-brand-ink hover:brightness-110">
          <LogIn size={15} />로그인
        </Link>
      </div>
    );
  }
  if (mode === "missing") {
    return (
      <div className="rounded-lg border border-line bg-panel p-4 text-sm">
        <p className="font-semibold">공동 편집 기록지를 찾을 수 없어요</p>
        <p className="mt-1 text-muted">링크가 잘못되었거나, 5일 동안 수정이 없어 삭제된 기록지예요.</p>
        <Button size="sm" className="mt-3" onClick={sheet.exitShare}>새 기록지로 시작</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/[0.06] px-3 py-2 text-sm">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-win" /></span>
      <b>공동 편집 중</b>
      <span className="min-w-0 truncate text-muted">
        접속 {members.length}명{members.length ? ` · ${members.join(", ")}` : ""}
      </span>
      <span className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => sheet.setLinkOpen(true)}><Link2 size={14} />링크 보기</Button>
        <Button size="sm" variant="ghost" onClick={sheet.leaveShare} title="지금 내용을 이 기기로 복사해 혼자 편집해요. 다른 사람의 공동 기록지는 그대로 남아요">혼자 편집으로 전환</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmExit(true)}><LogOut size={14} />기록지 나가기</Button>
      </span>
      {dialogs}
    </div>
  );
}

/** 혼자 편집 화면 위: 이 기기에서 최근에 공동 편집한 기록지(5일 이내) — 눌러서 이어서 편집 */
function RecentList({ kind }: { kind: "pool" | "team" }) {
  const pathname = usePathname();
  const [list, setList] = useState<RecentSheet[]>([]);
  useEffect(() => setList(recentSheets(kind)), [kind]);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
      <span className="mr-1 flex items-center gap-1 text-xs text-muted"><History size={13} />최근 공동 편집</span>
      {list.map((x) => (
        <Link key={x.id} href={`${pathname}?share=${x.id}`} className="max-w-[12rem] truncate rounded-md bg-panel2 px-2.5 py-1 text-xs hover:text-brand">
          {x.title.trim() || "제목 없는 기록지"} <span className="text-muted">· {new Date(x.at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</span>
        </Link>
      ))}
    </div>
  );
}
