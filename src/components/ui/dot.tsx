// 접속 표시 같은 상태 점: 유펜 회원 = 녹색, 비회원 = 회색
export function Dot({ member, className = "" }: { member: boolean; className?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${member ? "bg-emerald-400" : "bg-muted/50"} ${className}`}
      title={member ? "유펜 회원" : "비회원"}
    />
  );
}
