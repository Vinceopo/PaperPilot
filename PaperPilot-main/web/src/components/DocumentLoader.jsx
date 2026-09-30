/** Animated document loader for mechanics and manuscript upload/processing states. */

import documentLoader from "../assets/document-loader.webp";

export default function DocumentLoader({ className = "h-24 w-24" }) {
  return (
    <img
      src={documentLoader}
      alt=""
      aria-hidden="true"
      draggable="false"
      className={`select-none object-contain ${className}`}
    />
  );
}
