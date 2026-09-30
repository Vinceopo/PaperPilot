/** Paper plane flying along a wavy trail — workspace loading state. */

const FLIGHT = "M8 62 C 40 8, 78 8, 104 40 S 168 96, 200 58 S 238 12, 252 30";
const DURATION = "2.6s";

export default function PaperPlaneLoader({ className = "h-24 w-64" }) {
  return (
    <svg viewBox="0 0 260 100" className={className} fill="none" aria-hidden="true">
      <path
        d={FLIGHT}
        pathLength="1"
        stroke="#16bfa8"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1"
        strokeDashoffset="1"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="1;0;0"
          keyTimes="0;0.8;1"
          dur={DURATION}
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.9;0.9;0"
          keyTimes="0;0.8;1"
          dur={DURATION}
          repeatCount="indefinite"
        />
      </path>

      <g>
        <path d="M14 0 L-12 -10 L-6 0 L-12 10 Z" fill="#16bfa8" />
        <path d="M14 0 L-6 0 L-12 10 Z" fill="#109b89" />
        <path d="M14 0 L-6 0" stroke="#dcf7f2" strokeWidth="1" strokeLinecap="round" />
        <animateMotion
          path={FLIGHT}
          rotate="auto"
          keyPoints="0;1;1"
          keyTimes="0;0.8;1"
          calcMode="linear"
          dur={DURATION}
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="1;1;0"
          keyTimes="0;0.8;1"
          dur={DURATION}
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}
