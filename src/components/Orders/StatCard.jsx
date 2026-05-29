import { cn } from '../../utils/cn'

export default function StatCard({ stat }) {
  const Icon = stat.icon
  return (
    <div
      className={cn(
        "relative flex items-center gap-3.5 px-4 py-3.5 rounded-xl border transition-all duration-300 hover:scale-[1.02] group",
        `bg-gradient-to-br ${stat.gradient}`,
        stat.borderColor,
        stat.glow
      )}
    >
      <div className={cn("flex items-center justify-center w-10 h-10 rounded-xl transition-transform group-hover:scale-110", stat.iconBg)}>
        <Icon className={cn("w-5 h-5", stat.iconColor)} />
      </div>
      <div>
        <p className={cn("text-2xl font-bold tabular-nums", stat.valueColor)}>{stat.value}</p>
        <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest">{stat.label}</p>
      </div>
    </div>
  )
}
