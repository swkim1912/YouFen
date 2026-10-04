// 승률 원 그래프 + 득점/실점(KDA 느낌) + 득실비.
// 유저 전적검색(ProfileView)과 선수 프로필(AthleteView)이 같은 모양을 쓰도록 공용으로 분리했다.
export function StatDonut({ wins, losses, gf, ga }: { wins: number; losses: number; gf: number; ga: number }) {
  const n = wins + losses;
  const rate = n === 0 ? 0 : Math.round((wins / n) * 100);
  const ratio = ga === 0 ? "∞" : (gf / ga).toFixed(2); // 득실비: 득점 ÷ 실점
  const R = 36, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="14" className="stroke-loss" />
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="14" className="stroke-win" strokeDasharray={`${(C * rate) / 100} ${C}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold">{rate}%</div>
      </div>
      <div>
        <div className="text-xs text-muted">{wins}승 {losses}패</div>
        <div className="text-lg font-bold">
          {gf} / <span className="text-loss">{ga}</span>
        </div>
        <div className="text-base font-extrabold text-white">{ratio}:1</div>
      </div>
    </div>
  );
}
