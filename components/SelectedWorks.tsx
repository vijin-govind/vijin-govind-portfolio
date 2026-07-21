'use client';

import { motion } from 'motion/react';
import { selectedWorks, type Work } from '@/content/portfolio';

/**
 * The selected-works grid, sitting under the experience list.
 *
 * Monochrome to match the rest of the page: each card's media is a placeholder
 * tile carrying the work's index and monogram, sized to a fixed ratio so real
 * screenshots can drop straight in later without reflowing the layout. Cards
 * animate in on scroll rather than on load — they live below the fold, so tying
 * their entrance to the hero's would waste it on pixels no one is looking at.
 */
export function SelectedWorks() {
  return (
    <section className="mt-24" aria-labelledby="works-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="works-heading" className="text-sm text-ink-faint">
          Selected works
        </h2>
        <span className="text-sm text-ink-faint tabular-nums">
          {String(selectedWorks.length).padStart(2, '0')}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2">
        {selectedWorks.map((work, i) => (
          <WorkCard key={work.id} work={work} index={i} />
        ))}
      </div>
    </section>
  );
}

function WorkCard({ work, index }: { work: Work; index: number }) {
  const label = String(index + 1).padStart(2, '0');
  // The whole card is one hover target; `group` lets the media and title react
  // together. Linkable only when a real destination exists.
  const inner = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-scrim/40 transition-colors duration-500 group-hover:bg-scrim/70">
        {work.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={work.image}
            alt={`${work.title}, ${work.tag}`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          // Monogram placeholder for works with no cover image yet. Same tile
          // ratio as a real image, so adding one never reflows the layout.
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-bold text-paper/70 transition-transform duration-500 group-hover:scale-110 md:text-6xl">
              {work.title.charAt(0)}
            </span>
          </div>
        )}

        {/* Index sits above the image, so it needs its own contrast when one is
            present rather than relying on the pale placeholder background. */}
        <span
          className={`absolute left-4 top-3.5 text-xs tabular-nums ${
            work.image ? 'text-paper/80 drop-shadow-sm' : 'text-ink-faint'
          }`}
        >
          {label}
        </span>

        {/* Open affordance — only shown when the card actually navigates. */}
        {work.href && (
          <span
            aria-hidden
            className="absolute right-3 top-3 flex h-8 w-8 translate-y-1 items-center justify-center rounded-full bg-ink text-sm text-paper opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          >
            ↗
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h3 className="text-base font-medium text-ink md:text-lg">{work.title}</h3>
        {work.year && <span className="shrink-0 text-sm text-ink-faint">{work.year}</span>}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{work.tag}</p>
    </>
  );

  const cardMotion = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.7, delay: (index % 2) * 0.06, ease: [0.22, 1, 0.36, 1] as const },
  };

  if (work.href) {
    // Internal case studies (same origin, own back button) open in place; only
    // off-site links get a new tab. Detecting on the protocol keeps this correct
    // for any future work without a per-item flag.
    const external = /^https?:\/\//.test(work.href);
    return (
      <motion.a
        {...cardMotion}
        href={work.href}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        className="group block"
      >
        {inner}
      </motion.a>
    );
  }

  // No destination yet: still a coherent, hoverable tile, just not a link.
  return (
    <motion.div {...cardMotion} className="group block">
      {inner}
    </motion.div>
  );
}
