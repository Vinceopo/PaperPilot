/** Looping "paper under review" animation shown while a manuscript is being analysed. */

import { useEffect, useRef } from "react";

export default function PaperRollAnimation({ className = "h-40 w-40" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let animation = null;
    let cancelled = false;

    Promise.all([import("lottie-web/build/player/lottie_light"), import("../assets/paper-roll.json")])
      .then(([lottieModule, dataModule]) => {
        if (cancelled || !containerRef.current) return;
        const lottie = lottieModule.default || lottieModule;
        animation = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: dataModule.default || dataModule,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, []);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
