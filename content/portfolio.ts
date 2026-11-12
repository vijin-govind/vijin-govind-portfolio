/**
 * Single source of truth for everything the portfolio renders. The homepage
 * grid and the spatial scene read the same `projects` list, so a project added,
 * reordered or reworded here lands in both, and the two can never drift apart
 * again. `form` selects which 3D archetype represents the project in AR.
 *
 * Copy is condensed from the full case studies under public/case-studies/.
 */

export type ProjectForm = 'temple' | 'dashboard' | 'racetrack' | 'easel' | 'film';

export interface Project {
  id: string;
  title: string;
  /** Spatial label line, read under the object. */
  discipline: string;
  /** Homepage card line: client and/or discipline. */
  tag: string;
  year?: string;
  /** Anchors the project in the spatial scene: [x, y, z] in metres. */
  position: [number, number, number];
  form: ProjectForm;
  summary: string;
  role: string;
  /** Shown on the floating panel once the project is opened. */
  detail: string[];
  metrics: { label: string; value: string }[];
  /**
   * Cover image for the homepage card and the spatial panel. Cropped to a 4:3
   * tile on the homepage, so keep the subject away from the far left and right
   * edges. The card falls back to the monogram placeholder when absent.
   */
  image?: string;
  /**
   * The full case study. Static pages under public/ need the explicit
   * index.html: Next serves public files by exact path and does not resolve a
   * directory to its index.
   */
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

export const experience = [
  { company: 'AB inBev', role: 'Product Designer', years: '2023–' },
  { company: 'Intelous.Ai', role: 'Product Designer', years: '2022–2023' },
  { company: 'Experion Technologies', role: 'UIUX Designer', years: '2021–2022' },
  { company: 'SalesBox', role: 'Software Engineer', years: '2016–2018' },
];

/**
 * Scene layout, in metres: a shallow arc facing the visitor, the digital work
 * on the left and centre, the physical and cinematic work on the right — the
 * same digital → physical → cinematic order the hero sentence rotates through.
 * Ground-standing objects share one floor height (-0.35) so their labels line
 * up; the dashboard is a wall-hung board and floats at eye level instead. AMG,
 * the lowest object, stands nearest so nothing hides behind it.
 */
export const projects: Project[] = [
  {
    id: 'mics360',
    title: 'MICS 360',
    discipline: 'Digital · Enterprise platform',
    tag: 'AB InBev · Enterprise application',
    year: '2025–26',
    position: [-1.72, 0.05, -2.35],
    form: 'dashboard',
    image: '/works/mics360.jpg',
    href: '/case-studies/mics360/index.html',
    summary:
      'The compliance platform 5,000+ people at AB InBev use every quarter, moved off Power Apps onto a proper web app without losing a single rule.',
    role: 'Lead product designer · 6 months',
    detail: [
      'Twelve compliance tools across seven global zones, all on Power Apps. The problem was never what the platform did, but how long everything took: slow logins, hunting for modules, and forms that held their errors until the very end.',
      'I rebuilt the core flow end to end: one hub instead of twelve doors, dense records split into tabs, validation that appears while you type, and a bulk import that only returns the rows that failed.',
      'Login dropped from around a minute to about fifteen seconds, and all thirty-nine compliance controls stayed exactly as strict as before.',
    ],
    metrics: [
      { label: 'Task time', value: '50%+ faster' },
      { label: 'Users', value: '5,000+' },
      { label: 'Modules', value: '12 → 1' },
    ],
  },
  {
    id: 'temple-address',
    title: 'TempleAddress',
    discipline: 'Digital · Cultural product',
    tag: 'Product design · Cultural',
    year: '2024–25',
    position: [-0.8, -0.35, -3.1],
    form: 'temple',
    image: '/works/temple-address.jpg',
    href: '/case-studies/temple-address/index.html',
    summary:
      'A booking system for temple rituals, built for devotees who have never installed an app.',
    role: 'Product design · Co-founder',
    detail: [
      'To book a pooja, you call the temple office. The caller is usually over 55 and has never installed an app; the secretary answering fields 30–40 of these calls a day.',
      'Our first version, a full portal and app, failed testing with elderly devotees. We rebuilt around what they already trust: a QR at the temple gate that opens a web page, and a WhatsApp assistant for those who never open a browser.',
      'Eight steps mirror the phone call they replace, with the birth star as a required, searchable field. A booking takes under two minutes.',
    ],
    metrics: [
      { label: 'Temples', value: '20+ live' },
      { label: 'Devotees', value: '50+ active' },
      { label: 'Marketing', value: '₹0' },
    ],
  },
  {
    id: 'amg',
    title: 'AMG',
    discipline: 'Digital · Event platform',
    tag: 'Self exploration · Event platform',
    position: [0.15, -0.35, -1.95],
    form: 'racetrack',
    image: '/works/amg.jpg',
    href: '/case-studies/amg/index.html',
    summary:
      'One screen for the person running the whole race day: a 24-hour exercise designing a command dashboard for the AMG Driving Academy.',
    role: 'Solo · Research to UI · Self-directed',
    detail: [
      'A race day runs on a dozen tools, and the organizer has to watch the track, the marshals, safety and the crowd at once. With no organizers to interview in 24 hours, I worked backward from everything that happens to put on a race.',
      'I mapped spectators, participants and organizers, then cut to the organizer alone. The live track map and leaderboard anchor the screen; marshals, livestream numbers and team chat sit around it.',
      'Dark and high-contrast for a bright trackside day, laptop and tablet only, because a phone is too small for the density the job needs. A brief, not a client project, and it did not ship.',
    ],
    metrics: [
      { label: 'Time', value: '24 hours' },
      { label: 'Screens', value: '5' },
      { label: 'Surface', value: 'Laptop · Tablet' },
    ],
  },
  {
    id: 'art-craft',
    title: 'Art & Craft',
    discipline: 'Physical · Murals & craft',
    tag: 'Murals · sketching · exhibitions',
    position: [1.05, -0.35, -3.05],
    form: 'easel',
    // The Kerala IT Mission wall mural, cropped to the card's 4:3 tile.
    image: '/works/art-craft.jpg',
    href: '/case-studies/art-craft/index.html',
    summary:
      'Murals, sketches and a few things built by hand. It is where a lot of my sense of composition and colour comes from.',
    role: 'Muralist · Sketcher · Maker',
    detail: [
      'Before any of this was product design, it was drawing. I still paint murals, sketch when I travel, and take on the odd hands-on craft project.',
      "A wall mural for the Kerala State IT Mission's own building, and studies in the traditional Kerala mural style you see on temple walls.",
      'Giant biodegradable puppets for the 2019 Manchester Day Parade, a cultural exchange between the Kerala government and Manchester City Council.',
    ],
    metrics: [
      { label: 'Murals', value: 'Wall · Canvas' },
      { label: 'Craft', value: 'Parade puppets' },
      { label: 'Sketches', value: 'On location' },
    ],
  },
  {
    id: 'film-motion',
    title: 'Film & Motion',
    discipline: 'Cinematic · Film & motion',
    tag: 'Short films · documentary · motion',
    position: [2.0, -0.35, -2.3],
    form: 'film',
    // The loom shot from Thread 2 Thread's poster frame (its YouTube thumbnail),
    // self-hosted. Cropped clear of the poster's baked-in title, which fought
    // the card's own type and sat under the index pill.
    image: '/works/film-motion.jpg',
    href: '/case-studies/film-motion/index.html',
    summary:
      'Short films and motion work, made for the same reasons I design: pacing, rhythm, and knowing what to cut.',
    role: 'Filmmaking · Motion',
    detail: [
      'Thread 2 Thread, a documentary on the story of weaving. Creator and Created is Chained, a Malayalam short film. In a Journey (Oru Yathrayil), a travel short.',
      'And event motion coverage of the 2019 Manchester Day Parade in the UK. Telling a story in motion is a different discipline from an interface, but the instincts overlap more than you would think.',
    ],
    metrics: [
      { label: 'Films', value: '4' },
      { label: 'Forms', value: 'Doc · Short · Event' },
      { label: 'Languages', value: 'Malayalam · EN' },
    ],
  },
];

/** What a homepage card needs. Derived, never written by hand. */
export type Work = Pick<Project, 'id' | 'title' | 'tag' | 'year' | 'image' | 'href'>;

export const selectedWorks: Work[] = projects.map(({ id, title, tag, year, image, href }) => ({
  id,
  title,
  tag,
  year,
  image,
  href,
}));
