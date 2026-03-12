// components/tournament-header.tsx
type TournamentHeaderProps = {
  title: string;
};

export function TournamentHeader({ title }: TournamentHeaderProps) {
  return (
    <header className="space-y-3">
      <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
        Live tournament
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
          {title}
        </h1>
      </div>
    </header>
  );
}