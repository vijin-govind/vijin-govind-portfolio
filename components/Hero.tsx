'use client';

import { motion } from 'motion/react';
import { experience, profile } from '@/content/portfolio';
import { RotatingWord } from './RotatingWord';

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

      <div className="col-span-4 flex flex-col justify-center pb-64 pt-28 md:col-span-6 md:py-32">
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
          {profile.greeting}
        </motion.h1>

        <motion.div
          initial="hidden"
          animate="show"
          custom={1}
          variants={rise}
          className="mt-12 space-y-1.5 text-lg leading-relaxed text-ink-soft md:text-xl"
        >
          <p>{profile.philosophy.opening}</p>
          <p>
            {profile.philosophy.prefix}
            {/* The rotating word ends the line, so its changing width can never
                push anything sideways. */}
            <span className="ml-2 inline-block">
              <RotatingWord
                words={profile.philosophy.disciplines}
                className="font-semibold text-ink"
              />
            </span>
          </p>
          <p>{profile.philosophy.closing}</p>
        </motion.div>

        <motion.p
          initial="hidden"
          animate="show"
          custom={2}
          variants={rise}
          className="mt-10 text-lg leading-relaxed text-ink-soft md:text-xl"
        >
          I live in {profile.location}. You can keep up with me on{' '}
          {profile.socials.map((s, i) => (
            <span key={s.label}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink underline decoration-hairline decoration-1 underline-offset-[6px] transition-colors duration-300 hover:decoration-ink"
              >
                {s.label}
              </a>
              {i < profile.socials.length - 1 && <span className="text-ink-soft"> or </span>}
            </span>
          ))}
        </motion.p>

        <motion.div initial="hidden" animate="show" custom={2.5} variants={rise}>
          <a
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
            Experience
          </h2>

          <ul className="mt-8 space-y-9">
            {experience.map((job) => (
              <li key={job.company} className="grid grid-cols-2 gap-4">
                <span className="text-base text-ink md:text-lg">{job.company}</span>
                <span className="flex flex-col">
                  <span className="text-base text-ink-soft md:text-lg">{job.role}</span>
                  <span className="mt-1 text-sm text-ink-faint">{job.years}</span>
                </span>
              </li>
            ))}
          </ul>
        </motion.section>
      </div>
    </div>
  );
}
