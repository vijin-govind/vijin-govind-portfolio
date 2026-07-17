'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** How long each word holds before handing over. */
const HOLD_MS = 1900;

/** Reads a list the way a person would say it: "a, b, or c". */
function spoken(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')}, or ${words[words.length - 1]}`;
}

/**
 * One word in a sentence, replaced on a timer.
 *
 * The outgoing and incoming words overlap rather than swapping in sequence: a
 * mode="wait" handover leaves the sentence visibly missing its object for the
 * length of the exit, which reads as a flicker rather than a change of mind.
 * Overlapping needs the words taken out of flow, hence the invisible spacer —
 * it is what gives the inline box its width, height and baseline while the real
 * words are positioned on top of it.
 */
export function RotatingWord({
  words,
  className = '',
}: {
  words: string[];
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced || words.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), HOLD_MS);
    return () => clearInterval(id);
  }, [reduced, words.length]);

  // Reduced motion means no auto-updating text at all, not a gentler version of
  // it: the rotation *is* content, so when it cannot move, state it outright.
  if (reduced || words.length < 2) {
    return <span className={className}>{spoken(words)}</span>;
  }

  const word = words[i];

  return (
    <>
      {/* Screen readers get the whole claim once. Announcing a word that mutates
          on a loop forever would be hostile, so the live text is hidden from
          them and this static line carries the meaning. */}
      <span className="sr-only">{spoken(words)}</span>

      <span aria-hidden className="relative inline-block whitespace-nowrap">
        {/* Sizes the box to the current word and sets the baseline. Invisible,
            not hidden, so descenders still count toward the line box. */}
        <span className={`invisible ${className}`}>{word}</span>

        <AnimatePresence initial={false}>
          <motion.span
            key={word}
            initial={{ opacity: 0, y: '0.42em', filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: '0em', filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: '-0.42em', filter: 'blur(5px)' }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute left-0 top-0 ${className}`}
          >
            {word}
          </motion.span>
        </AnimatePresence>
      </span>
    </>
  );
}
