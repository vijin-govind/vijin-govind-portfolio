/**
 * Single source of truth for everything the portfolio renders — the flat page
 * and the spatial scene read from the same objects, so a copy edit here lands
 * in both. `form` selects which 3D archetype represents the project in AR.
 */

export type ProjectForm = 'temple' | 'dashboard' | 'hologram' | 'prototype';

export interface Project {
  id: string;
  title: string;
  discipline: string;
  year: string;
  /** Anchors the project in the spatial scene: [x, y, z] in metres. */
  position: [number, number, number];
  form: ProjectForm;
  summary: string;
  role: string;
  /** Shown on the floating panel once the project is opened. */
  detail: string[];
  metrics: { label: string; value: string }[];
  href?: string;
}

export const profile = {
  name: 'Vijin Govind',
  greeting: "Hey, I'm Vijin Govind,",
  /**
   * The claim is one sentence whose object keeps changing, so it is written as
   * one sentence with a rotating object — not three near-identical lines. The
   * repetition was the copy restating a structure the motion can carry.
   */
  philosophy: {
    opening: 'I design experiences.',
    prefix: "Sometimes they're",
    disciplines: ['digital', 'physical', 'cinematic'],
    closing: "But they're always designed with intention.",
  },
  location: 'Bangalore, India',
  email: 'info@vass.co.in',
  socials: [
    { label: 'Instagram', href: 'https://instagram.com/' },
    { label: 'Linkedin', href: 'https://linkedin.com/in/' },
  ],
};

export interface Work {
  id: string;
  title: string;
  /** One-line descriptor: client and/or discipline. */
  tag: string;
  year?: string;
  /**
   * Cover image for the card. Cropped to the card's 4:3 tile, so keep the
   * subject away from the far left and right edges. Falls back to the
   * monogram placeholder when absent.
   */
  image?: string;
  /**
   * Optional destination. Left undefined until there is a real case study to
   * link to — a card with no href renders as a non-navigating tile rather than
   * a link that goes nowhere, and the "open" affordance only appears when a
   * link actually exists.
   */
  href?: string;
}

export const selectedWorks: Work[] = [
  {
    id: 'mics360',
    title: 'MICS 360',
    tag: 'AB InBev · Enterprise application',
    year: '2025–26',
    image: '/works/mics360.jpg',
    href: '/case-studies/mics360/index.html',
  },
  {
    id: 'temple-address',
    title: 'TempleAddress',
    tag: 'Product design · Cultural',
    year: '2024',
    image: '/works/temple-address.jpg',
    // Full standalone case study, hosted as a static page under public/. The
    // explicit index.html is required: Next serves public files by exact path
    // and does not resolve a directory to its index.
    href: '/case-studies/temple-address/index.html',
  },
  {
    id: 'amg',
    title: 'AMG',
    tag: 'Self exploration · Event platform',
    image: '/works/amg.jpg',
    href: '/case-studies/amg/index.html',
  },
  {
    id: 'art-craft',
    title: 'Art & Craft',
    tag: 'Murals · sketching · exhibitions',
    href: '/case-studies/art-craft/index.html',
  },
  {
    id: 'film-motion',
    title: 'Film & Motion',
    tag: 'Short films · documentary · motion',
    href: '/case-studies/film-motion/index.html',
  },
];

export const experience = [
  { company: 'AB inBev', role: 'Product Designer', years: '2023–' },
  { company: 'Intelous.Ai', role: 'Product Designer', years: '2022–2023' },
  { company: 'Experion Technologies', role: 'UIUX Designer', years: '2021–2022' },
  { company: 'SalesBox', role: 'Software Engineer', years: '2016–2018' },
];

export const projects: Project[] = [
  {
    id: 'temple-address',
    title: 'TempleAddress',
    discipline: 'Digital · Cultural Infrastructure',
    year: '2024',
    position: [-1.6, 0, -2.6],
    form: 'temple',
    summary:
      'A wayfinding and ritual-booking platform for temples, built around the idea that sacred space has its own information architecture.',
    role: 'Product Design · End to end',
    detail: [
      'Temples are not businesses and refuse to behave like one in a booking flow. The design problem was translating ritual sequence — not a product catalogue — into an interface.',
      'I mapped the physical journey of a visitor through the temple grounds first, then let that walk define the navigation model. Screens follow the path, not a menu.',
      'The result reads as an address book for the sacred: find the place, understand the ritual, arrive prepared.',
    ],
    metrics: [
      { label: 'Temples mapped', value: '—' },
      { label: 'Flow', value: 'Ritual-first' },
      { label: 'Surface', value: 'iOS · Android' },
    ],
  },
  {
    id: 'it-mics-360',
    title: 'IT MICS 360',
    discipline: 'Digital · Enterprise Analytics',
    year: '2023',
    position: [1.7, 0.1, -2.4],
    form: 'dashboard',
    summary:
      'A control surface for IT operations — consolidating fragmented monitoring into a single legible view of system health.',
    role: 'Product Design · Design systems',
    detail: [
      'Six dashboards, four teams, one question nobody could answer quickly: is anything actually on fire right now?',
      'I collapsed the tooling into one hierarchy — status, then cause, then history — and built the component library that let the team ship the rest without me.',
      'Density was the constraint. Every pixel earns its place on a wall-mounted display read from three metres away.',
    ],
    metrics: [
      { label: 'Dashboards merged', value: '6 → 1' },
      { label: 'Components', value: 'Systemised' },
      { label: 'Read distance', value: '3m' },
    ],
  },
  {
    id: 'conversational-ai',
    title: 'Conversational AI Suite',
    discipline: 'Digital · Applied AI',
    year: '2023',
    position: [0.1, 0.25, -3.4],
    form: 'hologram',
    summary:
      'Interfaces for AI that admit what they are — designed around uncertainty, correction, and the handoff back to a human.',
    role: 'Product Design · Interaction',
    detail: [
      'Most AI interfaces are designed for the demo, where the model is right. I designed for the other case.',
      'The work centred on legible confidence: showing the seam between what the system knows and what it is guessing, and making correction a single gesture rather than a restart.',
      'Intention here meant refusing the magic-box framing. Trust is built by being inspectable.',
    ],
    metrics: [
      { label: 'Model', value: 'Assistive' },
      { label: 'Pattern', value: 'Correctable' },
      { label: 'Posture', value: 'Inspectable' },
    ],
  },
  {
    id: 'physical-objects',
    title: 'Physical Objects',
    discipline: 'Physical · Industrial Design',
    year: '2021–',
    position: [-0.3, -0.15, -1.7],
    form: 'prototype',
    summary:
      'Product studies in aluminium, polycarbonate and paper — where the interaction is the object, and the object has no screen.',
    role: 'Industrial Design · Prototyping',
    detail: [
      'A pull cord is honest. You can see the whole mechanism, you know exactly what it will do, and it never needs a tutorial.',
      'These studies chase that quality: affordance carried entirely by form. No labels, no onboarding, no state you cannot feel with your hands.',
      'The cord on the homepage came out of this work. You just pulled one.',
    ],
    metrics: [
      { label: 'Material', value: 'Aluminium' },
      { label: 'Feedback', value: 'Tactile' },
      { label: 'Labels', value: 'None' },
    ],
  },
];
