import { useEffect, useRef } from "react";

/** Pause on 100% before the page jumps onto the plane. */
export const PAPER_CARRY_HOLD_MS = 420;

const JUMP_MS = 1780;
const FLY_MS = 3000;

/**
 * The page jumps onto the middle of a paper plane, then both glide right
 * through a light wind. Calls onDone when the flight finishes.
 *
 * Transforms live on the Web Animations API only. Putting them in React
 * `style` makes a later render snap the page and plane back apart.
 * @param {{ onDone?: () => void }} props
 */
export default function PaperCarryAway({ onDone }) {
  const stageRef = useRef(null);
  const flightRef = useRef(null);
  const paperRef = useRef(null);
  const windRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const stage = stageRef.current;
    const flight = flightRef.current;
    const paper = paperRef.current;
    const wind = windRef.current;
    if (!stage || !flight || !paper || !wind) return undefined;

    let cancelled = false;
    let finished = false;
    const animations = [];

    const finish = () => {
      if (finished || cancelled) return;
      finished = true;
      onDoneRef.current?.();
    };

    const play = (element, keyframes, options) => {
      const animation = element.animate(keyframes, options);
      animations.push(animation);
      return animation.finished.catch(() => {});
    };

    const distance = Math.max(340, stage.clientWidth * 0.5 + 180);

    (async () => {
      await play(
        paper,
        [
          {
            transform: "translate3d(0px, 130px, 0) rotate(-18deg)",
            clipPath: "inset(0% 0% 0% 0%)",
            easing: "cubic-bezier(0.18, 0.75, 0.28, 1)",
          },
          {
            transform: "translate3d(0px, -40px, 0) rotate(6deg)",
            clipPath: "inset(0% 0% 0% 0%)",
            offset: 0.5,
            easing: "cubic-bezier(0.42, 0, 0.58, 1)",
          },
          {
            transform: "translate3d(0px, 0px, 0) rotate(-6deg)",
            clipPath: "inset(0% 0% 50% 0%)",
            offset: 1,
          },
        ],
        { duration: JUMP_MS, easing: "linear", fill: "forwards" }
      );
      if (cancelled) return;
      paper.style.clipPath = "inset(0% 0% 50% 0%)";

      Array.from(wind.children).forEach((tail, index) => {
        const lift = index % 2 === 0 ? -8 : 8;
        play(
          tail,
          [
            { transform: "translate3d(0px, 0px, 0)", opacity: 0.35 },
            { transform: `translate3d(-6px, ${lift}px, 0)`, opacity: 1, offset: 0.5 },
            { transform: "translate3d(0px, 0px, 0)", opacity: 0.55 },
          ],
          {
            duration: 700,
            delay: index * 90,
            easing: "ease-in-out",
            iterations: Math.ceil(FLY_MS / 700) + 1,
          }
        );
      });

      const glide = Math.round(distance);
      const frames = Array.from({ length: 41 }, (_, index) => {
        const t = index / 40;
        const progress = 0.5 - 0.5 * Math.cos(Math.PI * t);
        const wave = Math.sin(Math.PI * t);
        return {
          transform: `translate3d(${Math.round(progress * glide)}px, ${Math.round(-wave * 10 - progress * 6)}px, 0) rotate(${(Math.cos(Math.PI * t) * 2.5).toFixed(2)}deg)`,
          offset: t,
        };
      });
      await play(flight, frames, { duration: FLY_MS, easing: "linear", fill: "forwards" });
      finish();
    })();

    const backup = window.setTimeout(finish, JUMP_MS + FLY_MS + 200);

    return () => {
      cancelled = true;
      window.clearTimeout(backup);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="absolute inset-0 z-20 h-full w-full overflow-hidden"
      style={{ justifySelf: "stretch", alignSelf: "stretch" }}
      role="status"
      aria-live="polite"
    >
      <p className="absolute inset-x-0 top-[70%] text-center text-base font-bold text-slate-800">
        Analysis complete
      </p>

      <div
        ref={flightRef}
        className="absolute left-1/2 top-[42%] z-[2] h-[140px] w-[320px]"
        style={{ marginLeft: -160, marginTop: -70 }}
      >
        <svg viewBox="0 0 320 140" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <g ref={windRef}>
            <path className="pp-wind-tail" d="M52 72 C 30 58, 14 80, 0 66" />
            <path className="pp-wind-tail" d="M58 88 C 32 100, 12 78, 0 94" />
            <path className="pp-wind-tail" d="M46 104 C 24 116, 8 98, 0 110" />
          </g>
          <path d="M28 44 L300 58 L62 90 Z" fill="#2ec9b6" />
          <path d="M28 44 L300 58 L88 66 Z" fill="#8ff3e6" />
          <path d="M48 78 L108 88 L66 116 Z" fill="#179e90" />
        </svg>
        <div ref={paperRef} className="pp-carry-paper">
          <svg viewBox="0 0 72 90" className="h-auto w-full" aria-hidden="true">
            <rect x="1.5" y="1.5" width="69" height="87" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
            <rect x="12" y="14" width="34" height="5" rx="2.5" fill="#e2e8f0" />
            <rect x="12" y="26" width="46" height="4" rx="2" fill="#e2e8f0" />
            <rect x="12" y="36" width="40" height="4" rx="2" fill="#e2e8f0" />
            <rect x="12" y="46" width="28" height="4" rx="2" fill="#b7ebe0" />
          </svg>
        </div>
      </div>
    </div>
  );
}
