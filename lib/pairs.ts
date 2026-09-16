/**
 * Cross-tabs for the results page. Each pairs two questions whose combination
 * says more than either alone — the shareable number is always a gap, never a
 * single split.
 */
export interface FeaturedPair {
  id: string;
  a: string;
  b: string;
  /** The quadrant that is the finding. */
  choiceA: string;
  choiceB: string;
  /** Denominator: everyone who answered both, or only those who picked choiceA. */
  base: "all" | "row";
  title: string;
  reading: string;
}

export const FEATURED_PAIRS: FeaturedPair[] = [
  {
    id: "flinch",
    a: "press",
    b: "fifty",
    choiceA: "yes",
    choiceB: "no",
    base: "row",
    title: "The flinch",
    reading:
      "of everyone who said they'd press the button changed their mind once there was a 50% chance it was them. This is the whole poll in one number.",
  },
  {
    id: "hatch",
    a: "unlimited",
    b: "growth",
    choiceA: "yes",
    choiceB: "yes",
    base: "all",
    title: "The closed escape hatch",
    reading:
      "said he should have made unlimited resources instead — then agreed we'd burn through those too, which means they talked themselves out of their own alternative.",
  },
  {
    id: "verdict",
    a: "right",
    b: "villain",
    choiceA: "yes",
    choiceB: "yes",
    base: "all",
    title: "Right and still the villain",
    reading:
      "say he was right and call him the villain anyway. Both can be true. Most people just won't say it out loud.",
  },
  {
    id: "deal",
    a: "press",
    b: "deal",
    choiceA: "no",
    choiceB: "obviously",
    base: "row",
    title: "Not by your hand",
    reading:
      "of the people who refused to press the button would happily take the deal that snaps a stranger to save their family. Same outcome, cleaner conscience.",
  },
];
