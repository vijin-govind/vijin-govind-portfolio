'use client';

import { motion } from 'motion/react';
import { experience, profile } from '@/content/portfolio';
import { RotatingWord } from './RotatingWord';
import { SelectedWorks } from './SelectedWorks';
import { ZeroGText } from './ZeroG';

/**
 * The editorial half of the homepage. Everything lives in the right six columns
 * of the 12-column grid — the left half is intentionally empty so the cord has
 * room to be an object rather than a decoration.
 */

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Hero() {
  return (
    // Below `md` there is no empty left column to hold the cord, so the content
    // is inset far enough to leave it a clear channel. The generous bottom
    // padding lets the last experience row scroll clear of the fixed camera
    // dock, which would otherwise sit permanently on top of it.
    <div className="grid min-h-screen grid-cols-4 gap-x-6 pl-[4.5rem] pr-6 md:grid-cols-12 md:gap-x-8 md:px-10 lg:px-16">
      {/* Columns 1–6 stay empty on desktop: this is the cord's room. */}
      <div className="hidden md:col-span-6 md:block" aria-hidden />

      <div className="col-span-4 flex flex-col justify-center pb-28 pt-24 sm:pb-64 sm:pt-28 md:col-span-6 md:py-32">
        <motion.h1
          initial="hidden"
          animate="show"
          custom={0}
          variants={rise}
          // One line, always. The name is a fixed string 9.65× the font size
          // wide, and the hero sits in a full-width column on mobile but only a
          // ~6-of-12 column on desktop — so the two need different sizes, each
          // capped to fit its container. nowrap is the guarantee; the clamps
          // keep it from overflowing that guarantee.
          className="tracking-hero whitespace-nowrap text-[clamp(1.25rem,7vw,1.85rem)] font-bold leading-[1.02] text-ink md:text-[clamp(1.75rem,3.7vw,4.5rem)]"
        >
          {/* In XR every letter is its own body — the name is the thing most
              worth knocking around. */}
          <ZeroGText text={profile.greeting} by="chars" />
        </motion.h1>

        <motion.div
          initial="hidden"
          animate="show"
          custom={1}
          variants={rise}
          className="mt-12 space-y-1.5 text-lg leading-relaxed text-ink-soft md:text-xl"
        >
          <p>
            <ZeroGText text={profile.philosophy.opening} />
          </p>
          <p>
            <ZeroGText text={profile.philosophy.prefix} />
            {/* The rotating word ends the line, so its changing width can never
                push anything sideways. */}
            <span data-zerog className="ml-2 inline-block">
              <RotatingWord
                words={profile.philosophy.disciplines}
                className="font-semibold text-ink"
              />
            </span>
          </p>
          <p>
            <ZeroGText text={profile.philosophy.closing} />
          </p>
        </motion.div>

        <motion.p
          initial="hidden"
          animate="show"
          custom={2}
          variants={rise}
          className="mt-10 text-lg leading-relaxed text-ink-soft md:text-xl"
        >
          <ZeroGText text={`I live in ${profile.location}. You can keep up with me on`} />{' '}
          {profile.socials.map((s, i) => (
            <span key={s.label}>
              <a
                data-zerog
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block text-ink underline decoration-hairline decoration-1 underline-offset-[6px] transition-colors duration-300 hover:decoration-ink"
              >
                {s.label}
              </a>
              {i < profile.socials.length - 1 && (
                <span className="text-ink-soft">
                  {' '}
                  <ZeroGText text="or" />{' '}
                </span>
              )}
            </span>
          ))}
        </motion.p>

        <motion.div initial="hidden" animate="show" custom={2.5} variants={rise}>
          <a
            data-zerog
            href="/resume.pdf"
            download="Vijin-Govind-Resume.pdf"
            className="mt-10 inline-flex w-fit items-center gap-2.5 rounded-full border border-ink px-6 py-3 text-sm font-medium text-ink transition-colors duration-300 hover:bg-ink hover:text-paper"
          >
            Download resume
            <span aria-hidden className="text-xs">↓</span>
          </a>
        </motion.div>

        <motion.section
          initial="hidden"
          animate="show"
          custom={3}
          variants={rise}
          className="mt-24"
          aria-labelledby="experience-heading"
        >
          <h2 id="experience-heading" className="text-sm text-ink-faint">
            <ZeroGText text="Experience" />
          </h2>

          {/* Phone: one column — company, then role and years on a line — so
              nothing wraps mid-phrase in a half-width cell. Tablet and up:
              the two-column ledger. */}
          <ul className="mt-6 divide-y divide-hairline sm:mt-8 sm:space-y-9 sm:divide-y-0">
            {experience.map((job) => (
              <li
                key={job.company}
                className="flex flex-col gap-0.5 py-4 first:pt-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:py-0"
              >
                <span className="text-base font-medium text-ink sm:font-normal md:text-lg">
                  <ZeroGText text={job.company} />
                </span>
                <span className="flex items-baseline justify-between gap-3 sm:flex-col sm:justify-start sm:gap-0">
                  <span className="text-[15px] text-ink-soft sm:text-base md:text-lg">
                    <ZeroGText text={job.role} />
                  </span>
                  <span className="shrink-0 text-sm text-ink-faint tabular-nums sm:mt-1">
                    <ZeroGText text={job.years} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </motion.section>

        <SelectedWorks />

        {/* A close for the page: on a phone especially, the scroll otherwise
            just stops on the last card with no next step. */}
        <section className="mt-24 border-t border-hairline pt-10 sm:mt-32" aria-labelledby="contact-heading">
          <h2 id="contact-heading" className="text-sm text-ink-faint">
            <ZeroGText text="Get in touch" />
          </h2>
          <p className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
            <ZeroGText text="Have a product that needs a designer?" />
          </p>
          <a
            data-zerog
            href={`mailto:${profile.email}`}
            className="mt-6 inline-flex w-fit items-center gap-2.5 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-paper transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            {profile.email}
            <span aria-hidden>↗</span>
          </a>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-soft">
            {profile.socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                // 44px-tall hit area on touch without changing the type.
                className="-my-3 inline-flex items-center py-3 underline decoration-hairline underline-offset-[6px] transition-colors hover:text-ink hover:decoration-ink"
              >
                {s.label}
              </a>
            ))}
            <a
              href="/resume.pdf"
              download="Vijin-Govind-Resume.pdf"
              className="-my-3 inline-flex items-center py-3 underline decoration-hairline underline-offset-[6px] transition-colors hover:text-ink hover:decoration-ink"
            >
              Resume
            </a>
          </div>
          <p className="mt-10 text-xs text-ink-faint">
            {profile.name} · {profile.location}
          </p>
        </section>
      </div>
    </div>
  );
}
