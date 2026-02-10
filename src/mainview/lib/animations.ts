import {
  type Transition,
  useReducedMotion,
  type Variants,
} from "framer-motion";

/* ── Transition presets ── */
export const transitions = {
  spring: { type: "spring", stiffness: 500, damping: 30 } as Transition,
  snappy: { type: "spring", stiffness: 700, damping: 35 } as Transition,
  gentle: { type: "spring", stiffness: 300, damping: 25 } as Transition,
  fast: { duration: 0.15, ease: "easeOut" } as Transition,
  normal: { duration: 0.2, ease: "easeOut" } as Transition,
} as const;

/* ── Reusable variant sets ── */

/** Simple opacity fade */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Slide in from right (panels) */
export const slideRightVariants: Variants = {
  initial: { x: 16, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 16, opacity: 0 },
};

/** Slide up from bottom (job panel, toasts) */
export const slideUpVariants: Variants = {
  initial: { y: 24, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 24, opacity: 0 },
};

/** Scale + fade (menus, modals, command palette) */
export const scaleVariants: Variants = {
  initial: { scale: 0.95, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.95, opacity: 0 },
};

/** Content fade (from translateY) */
export const contentFadeVariants: Variants = {
  initial: { y: 4, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: -4, opacity: 0 },
};

/** Stagger container — apply to parent, children use staggerItemVariants */
export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.03 },
  },
};

/** Stagger item — use inside a stagger container */
export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

/** Backdrop overlay */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/* ── Reduced motion hook wrapper ── */

/**
 * Returns transition and variant overrides that disable animations
 * when the user prefers reduced motion.
 */
export function useAccessibleAnimation() {
  const shouldReduce = useReducedMotion();

  const getTransition = (t: Transition): Transition =>
    shouldReduce ? { duration: 0 } : t;

  return { shouldReduce, getTransition };
}
