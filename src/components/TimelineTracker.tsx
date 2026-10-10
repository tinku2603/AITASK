import React from "react";
import { CheckCircle2, Clock, AlertCircle, XCircle, ArrowRight } from "lucide-react";

interface TimelineTrackerProps {
  status: string;
  size?: "sm" | "md";
}

const STEPS = [
  { id: "Draft", label: "Draft" },
  { id: "Pending Approval", label: "Pending Approval" },
  { id: "Settlement Processing", label: "Settlement" },
  { id: "Paid", label: "Paid" },
];

export const TimelineTracker: React.FC<TimelineTrackerProps> = ({ status, size = "md" }) => {
  if (status === "Rejected") {
    return (
      <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium w-fit">
        <XCircle className="w-3.5 h-3.5" />
        <span>Claim Rejected / Discarded</span>
      </div>
    );
  }

  if (status === "Awaiting User Input") {
    return (
      <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium w-fit animate-pulse">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Awaiting User Action</span>
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.id === status);
  const activeIdx = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className="flex items-center space-x-1 sm:space-x-2">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < activeIdx || status === "Paid";
        const isCurrent = idx === activeIdx && status !== "Paid";
        const isUpcoming = idx > activeIdx;

        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center space-x-1">
              <div
                className={`flex items-center justify-center rounded-full transition-all ${
                  size === "sm" ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]"
                } ${
                  isCompleted
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                    : isCurrent
                    ? "bg-indigo-500 text-white font-bold ring-2 ring-indigo-400/40"
                    : "bg-slate-800 text-slate-500 border border-slate-700"
                }`}
                title={step.label}
              >
                {isCompleted ? (
                  <CheckCircle2 className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
                ) : isCurrent ? (
                  <Clock className={size === "sm" ? "w-2.5 h-2.5 animate-spin" : "w-3 h-3 animate-spin"} />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`text-[11px] font-medium hidden md:inline-block ${
                  isCompleted
                    ? "text-emerald-400"
                    : isCurrent
                    ? "text-indigo-300 font-semibold"
                    : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-2 sm:w-4 transition-colors ${
                  idx < activeIdx ? "bg-emerald-500/40" : "bg-slate-800"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
