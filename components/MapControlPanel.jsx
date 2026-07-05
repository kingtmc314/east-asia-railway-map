'use client';

const TIER_TABS = [
  {
    id: 'hsr',
    label: '核心高鐵/新幹線',
    short: '高鐵',
    desc: 'Zoom 4–7',
    accent: 'from-red-500 to-rose-600',
    activeRing: 'ring-red-400/60',
  },
  {
    id: 'intercity',
    label: '城際/普鐵網',
    short: '城際',
    desc: 'Zoom 7–11',
    accent: 'from-blue-600 to-indigo-600',
    activeRing: 'ring-blue-400/60',
  },
  {
    id: 'metro',
    label: '都市地鐵/私鐵',
    short: '地鐵',
    desc: 'Zoom 12+',
    accent: 'from-violet-500 to-purple-600',
    activeRing: 'ring-violet-400/60',
  },
];

export default function MapControlPanel({
  mapReady,
  activeTier,
  onTierChange,
  regions,
  activeRegion,
  onRegionSelect,
  regionLoading,
  zoomLevel,
  zoomHint,
  loadedCount,
}) {
  return (
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center p-3 sm:p-4">
      <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-white/40 bg-white/70 p-3 shadow-xl shadow-neutral-900/5 backdrop-blur-xl sm:p-4">
        {/* 標題列 */}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-neutral-900 sm:text-base">
              東亞鐵路拓撲圖
            </h1>
            <p className="text-[10px] text-neutral-500 sm:text-[11px]">
              分區瀏覽 · 按需載入 · 60 FPS 優化
            </p>
          </div>
          <div className="text-right text-[10px] text-neutral-500 sm:text-[11px]">
            <div className="font-semibold text-neutral-700">Zoom {zoomLevel}</div>
            <div className="max-w-[140px] truncate">{zoomHint}</div>
            {loadedCount > 0 && <div>{loadedCount} 區域已快取</div>}
          </div>
        </div>

        {/* 分區 TAB */}
        <div
          className="mb-3 flex gap-1 rounded-xl bg-neutral-100/80 p-1"
          role="tablist"
          aria-label="鐵路分區"
        >
          {TIER_TABS.map((tab) => {
            const isActive = activeTier === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={!mapReady}
                onClick={() => onTierChange(tab.id)}
                className={[
                  'flex flex-1 flex-col items-center rounded-lg px-2 py-2 text-center transition-all duration-200',
                  isActive
                    ? `bg-gradient-to-br ${tab.accent} text-white shadow-md ring-2 ${tab.activeRing}`
                    : 'text-neutral-600 hover:bg-white/80 hover:text-neutral-900',
                  !mapReady ? 'cursor-wait opacity-50' : 'cursor-pointer',
                ].join(' ')}
              >
                <span className="text-xs font-bold sm:text-sm">{tab.short}</span>
                <span className={`hidden text-[9px] sm:block ${isActive ? 'text-white/80' : 'text-neutral-400'}`}>
                  {tab.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* 地區選單 + 載入提示 */}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="region-select" className="sr-only">
            選擇地區
          </label>
          <div className="relative min-w-[140px] flex-1">
            <select
              id="region-select"
              value={activeRegion || ''}
              disabled={!mapReady}
              onChange={(e) => {
                if (e.target.value) onRegionSelect(e.target.value);
              }}
              className="w-full appearance-none rounded-xl border border-neutral-200/80 bg-white/90 py-2 pl-3 pr-8 text-sm font-medium text-neutral-800 shadow-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300/50 disabled:cursor-wait disabled:opacity-50"
            >
              <option value="" disabled>
                選擇地區…
              </option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
              ▾
            </span>
          </div>

          {regionLoading && (
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-white/80 px-3 py-1.5 text-xs text-neutral-600">
              <svg
                className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="max-w-[180px] truncate">{regionLoading.message}</span>
              {regionLoading.total > 1 && (
                <span className="text-neutral-400">
                  {regionLoading.done}/{regionLoading.total}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
