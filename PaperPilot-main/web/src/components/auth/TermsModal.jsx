import { useEffect } from "react";

export const TERMS_SECTIONS = [
  {
    heading: "1. Acceptance of these terms",
    body: "By creating an account or using PaperPilot, you agree to these Terms and Conditions. If you do not agree, do not use the service. PaperPilot is intended for students, researchers, and professionals preparing academic manuscripts.",
  },
  {
    heading: "2. Using PaperPilot",
    body: "PaperPilot checks manuscripts against formatting and citation rules such as APA, MLA, and IEEE. Scan results, scores, and suggestions are guidance only. You remain responsible for the final content and formatting of your work and for meeting your institution, journal, or publisher requirements.",
  },
  {
    heading: "3. Your account",
    body: "Provide accurate registration details and keep your login credentials private. You are responsible for activity under your account. Notify us if you suspect unauthorized access. We may suspend or terminate accounts that misuse the service, attempt to bypass plan limits, or violate these terms.",
  },
  {
    heading: "4. Your documents",
    body: "You retain ownership of manuscripts you upload. You grant PaperPilot permission to store and process them solely to provide scans, previews, version history, and reports. Do not upload content you are not allowed to share. You may delete documents from your account subject to normal retention needed for backups and abuse prevention.",
  },
  {
    heading: "5. AI-generated results",
    body: "Some findings and explanations are produced with automated or AI-assisted systems and may be incomplete, outdated, or incorrect. Always review suggestions before applying them. PaperPilot does not guarantee acceptance by any journal, conference, or institution.",
  },
  {
    heading: "6. Plans and payments",
    body: "Free and paid plans (such as Premium and Pro) include the scan allowances and features shown at checkout. Paid plans are billed through PayMongo on a monthly or annual schedule. Allowances reset on the schedule for your plan. Canceling stops future renewals and returns you to the Free plan at the end of the current billing period unless otherwise stated.",
  },
  {
    heading: "7. Privacy",
    body: "We collect information needed to operate the service, including your name, email, account settings, and uploaded documents. We do not sell your personal data. Processing is limited to authentication, scans, reports, billing, and service improvement. See our privacy practices in the product for more detail.",
  },
  {
    heading: "8. Acceptable use",
    body: "Do not abuse the service, attempt unauthorized access, reverse engineer protected systems, upload malware, or use PaperPilot to infringe others' rights. We may limit or refuse service where these rules are broken.",
  },
  {
    heading: "9. Changes",
    body: "We may update these terms from time to time. Continued use of PaperPilot after an update means you accept the revised terms. Material changes may be highlighted in the app or by email when practical.",
  },
  {
    heading: "10. Contact",
    body: "Questions about these terms or your account can be sent through the support options available in PaperPilot.",
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
            className="h-11 rounded-[10px] border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
          {onAgree ? (
            <button
              type="button"
              onClick={onAgree}
              className="h-11 rounded-[10px] bg-accent px-5 text-sm font-semibold text-navy hover:bg-accent-hover"
            >
              I agree
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
