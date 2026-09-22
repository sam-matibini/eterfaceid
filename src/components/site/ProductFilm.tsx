import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function ProductFilm({
  src,
  poster,
  title,
  description,
  className,
}: {
  src: string;
  poster: string;
  title: string;
  description: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || reduceMotion || failed) return;
    const play = () => {
      void node.play().catch(() => {
        /* autoplay can be blocked; the poster remains visible until playback starts */
      });
    };
    play();
    node.addEventListener("canplay", play);
    return () => node.removeEventListener("canplay", play);
  }, [src, reduceMotion, failed]);

  const showStill = reduceMotion || failed;

  return (
    <figure className={cn("overflow-hidden border border-rule bg-paper", className)}>
      <div className="aspect-[8/5] overflow-hidden bg-paper">
        {showStill ? (
          <img
            src={poster}
            alt={`${title}: ${description}`}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            aria-label={`${title}: ${description}`}
            className="size-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <figcaption className="flex flex-col gap-1 border-t border-rule px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-5">
        <span className="text-[0.82rem] font-semibold text-ink">{title}</span>
        <span className="text-[0.75rem] leading-relaxed text-ink-soft">{description}</span>
      </figcaption>
    </figure>
  );
}
