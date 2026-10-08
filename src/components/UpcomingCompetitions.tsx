"use client";
// 대회 화면 위쪽 '다가오는 대회' (관리자가 직접 게시 — 관리자 페이지 > 다가오는 대회).
// 카드: 대표 사진(없으면 달력 아이콘) · D-day · 일자 · 대회명 · 장소. 누르면 상세 창(글·사진 5장·첨부 파일 5개·관련 링크).
// 대회가 끝나면(종료일, 없으면 시작일이 지나면) DB 함수 comp_notices_upcoming 이 빼고 준다. 비로그인도 본다.
import { useEffect, useState } from "react";
import { CalendarDays, Download, ExternalLink, MapPin } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { publicData } from "@/lib/fencing";
import { type CompNotice, dday, noticeDateText, noticeUrl, sizeText } from "@/lib/compNotice";
import { cn } from "@/lib/utils";

export function UpcomingCompetitions() {
  const [list, setList] = useState<CompNotice[] | null>(null);
  const [open, setOpen] = useState<CompNotice | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    publicData<CompNotice[]>("comp_notices_upcoming", {}, []).then(setList);
  }, []);

  if (!list || list.length === 0) return null; // 게시된 대회가 없으면 칸 자체를 숨긴다
  const shown = showAll ? list : list.slice(0, 4);

  return (
    <section className="space-y-2">
      <div className="flex items-end gap-2">
        <h2 className="text-lg font-bold">다가오는 대회</h2>
        <span className="pb-0.5 text-xs text-muted">{list.length}개</span>
        {list.length > 4 && (
          <button className="ml-auto text-xs text-muted hover:text-foreground" onClick={() => setShowAll((v) => !v)}>{showAll ? "접기" : "모두 보기"}</button>
        )}
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((n) => {
          const dd = dday(n.start_date, n.end_date);
          return (
            <li key={n.id}>
              <button onClick={() => setOpen(n)} className="flex w-full gap-3 rounded-lg border border-line bg-panel p-2.5 text-left hover:border-brand/40">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-panel2">
                  {n.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={noticeUrl(n.images[0].thumb)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted"><CalendarDays size={22} /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className={cn("rounded px-1.5 py-0.5 font-bold", dd === "D-DAY" || dd === "진행 중" ? "bg-loss/20 text-loss" : "bg-brand/15 text-brand")}>{dd}</span>
                    <span className="text-muted">{noticeDateText(n.start_date, n.end_date)}</span>
                  </div>
                  <p className="truncate text-sm font-semibold">{n.title}</p>
                  {n.place && <p className="flex items-center gap-1 truncate text-xs text-muted"><MapPin size={11} className="shrink-0" />{n.place}</p>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""} wide>
        {open && <NoticeDetail n={open} />}
      </Modal>
    </section>
  );
}

/** 상세: 일자·장소·링크 → 사진(누르면 원본) → 글 → 첨부 파일 */
export function NoticeDetail({ n }: { n: CompNotice }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{noticeDateText(n.start_date, n.end_date)} · {dday(n.start_date, n.end_date)}</span>
        {n.place && <span className="inline-flex items-center gap-1"><MapPin size={13} />{n.place}</span>}
        {n.link_url && <a href={n.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><ExternalLink size={13} />관련 링크</a>}
      </div>
      {n.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {n.images.map((im) => (
            <a key={im.path} href={noticeUrl(im.path)} target="_blank" rel="noopener noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={noticeUrl(im.path)} alt="" loading="lazy" className="h-56 max-w-[80vw] rounded-md object-contain bg-panel2" />
            </a>
          ))}
        </div>
      )}
      {n.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{n.body}</p>}
      {n.files.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted">첨부 파일</p>
          <ul className="space-y-1">
            {n.files.map((f) => (
              <li key={f.path}>
                <a href={noticeUrl(f.path, f.name)} className="flex items-center gap-2 rounded-md border border-line bg-panel2 px-3 py-2 hover:border-brand/40">
                  <Download size={14} className="shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted">{sizeText(f.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
