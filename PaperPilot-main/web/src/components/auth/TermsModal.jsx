import { useEffect } from "react";

export const TERMS_SECTIONS = [
  {
    heading: "1. Using PaperPilot",
    body: "PaperPilot checks academic manuscripts against formatting and citation rules (APA, MLA, and IEEE). Results are guidance only; you remain responsible for the final content and formatting of your work and for following your institution's requirements.",
  },
  {
    heading: "2. Your account",
    body: "Keep your login details private and accurate. You are responsible for activity under your account. We may suspend accounts that misuse the service.",
  },
  {
    heading: "3. Your documents",
    body: "You keep ownership of the manuscripts you upload. You allow PaperPilot to store and process them only to provide scans, previews, version history, and reports. Do not upload content you have no right to share.",
  },
  {
    heading: "4. AI-generated results",
    body: "Some findings and explanations are produced by AI and may be incomplete or incorrect. Review every suggestion before applying it.",
  },
  {
    heading: "5. Plans and payments",
    body: "Paid plans (Premium and Pro) are billed through PayMongo, monthly or annually. Scan allowances reset on the schedule shown for your plan. Canceling returns you to the Free plan.",
  },
  {
    heading: "6. Privacy",
    body: "We collect only what is needed to run the service, such as your name, email, and uploaded documents. We do not sell your personal data.",
  },
  {
    heading: "7. Changes",
    body: "We may update these terms. Continuing to use PaperPilot after an update means you accept the new terms.",
  },
];

export default function TermsModal({ open, onClose, onAgree }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 id="terms-title" className="text-lg font-bold text-navy">
            Terms and Conditions
          </h2>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-4 text-sm leading-relaxed text-slate-600">
          {TERMS_SECTIONS.map((section) => (
            <div key={section.heading}>
              <h3 className="font-semibold text-slate-800">{section.heading}</h3>
              <p className="mt-1">{section.body}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
          {onAgree ? (
            <button
              type="button"
              onClick={onAgree}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-navy hover:bg-accent-hover"
            >
              I agree
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
