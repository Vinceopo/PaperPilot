import { useEffect } from "react";

export const UPLOAD_JOURNEY = [
  {
    step: 1,
    label: "Upload Mechanics",
    description: "Choose the format rules: a saved guide, a new upload, or fields you set yourself.",
  },
  {
    step: 2,
    label: "Upload Manuscript",
    description: "Add the paper you want checked against those rules.",
  },
  {
    step: 3,
    label: "File Details",
    description: "Review what’s attached, then run the compliance scan.",
  },
];

const JOURNEY_SEEN_KEY = "paperpilot.uploadJourneySeen";

export function uploadJourneySeen() {
  try {
    return sessionStorage.getItem(JOURNEY_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markUploadJourneySeen() {
  try {
    sessionStorage.setItem(JOURNEY_SEEN_KEY, "1");
  } catch {
    // Private mode can block storage; closing the modal is still enough.
  }
}

function circleClass(item, current) {
  if (item.step === current) return "bg-[#16bfa8] text-[#092823] shadow-[0_6px_16px_rgba(22,191,168,0.35)]";
  if (item.step < current) return "bg-[#101a30] text-white";
  return "border border-slate-300 bg-white text-slate-400";
}

/** Step label + "Show Steps" control shown above each wizard panel heading. */
export function ShowStepsRow({ step, total = 3, onShowSteps }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#16bfa8]">
        Step {step} of {total}
      </p>
      {typeof onShowSteps === "function" && (
        <button
          type="button"
          onClick={onShowSteps}
          className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#109b89] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16bfa8] focus-visible:ring-offset-2"
        >
          Show Steps
        </button>
      )}
    </div>
  );
}

export default function UploadJourneyModal({ open, current = 1, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const currentItem = UPLOAD_JOURNEY.find((item) => item.step === current) || UPLOAD_JOURNEY[0];

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/50 p-5 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-journey-title"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl md:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#16bfa8]">How a scan works</p>
        <h2 id="upload-journey-title" className="mt-2 text-2xl font-bold tracking-tight text-[#172033]">
          Three steps
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          You are on step {current}: {currentItem.label}.
        </p>

        <ol className="mt-6">
          {UPLOAD_JOURNEY.map((item, index) => {
            const isCurrent = item.step === current;
            return (
              <li key={item.step} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-bold ${circleClass(item, current)}`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {item.step}
                  </span>
                  {index < UPLOAD_JOURNEY.length - 1 && (
                    <span className="my-1 w-px flex-1 bg-slate-200" aria-hidden="true" />
                  )}
                </div>
                <div className={index < UPLOAD_JOURNEY.length - 1 ? "pb-6 pt-1" : "pt-1"}>
                  <p
                    className={`flex flex-wrap items-center gap-2 text-base font-bold ${
                      isCurrent ? "text-[#109b89]" : "text-[#172033]"
                    }`}
                  >
                    <span>{item.label}</span>
                    {isCurrent && (
                      <span className="rounded-full bg-[#e7f8f5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#109b89]">
                        Now
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.description}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-[#16bfa8] py-3 text-sm font-bold text-[#092823] shadow-sm hover:bg-[#12ae99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16bfa8] focus-visible:ring-offset-2"
        >
          {current === 1 ? "Start step 1" : `Continue on step ${current}`}
        </button>
      </div>
    </div>
  );
}
