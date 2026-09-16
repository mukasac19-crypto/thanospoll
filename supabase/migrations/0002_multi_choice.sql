-- Multi-choice answers, and a session shape that matches the new results.
--
-- The bank moved from ten yes/no items to ten items where three carry four
-- options each. Answers now store a choice id ("keep", "absolutely_not",
-- "sign"), so the old two-value constraint has to go. Everything else about the
-- schema already worked unchanged, which was the point of storing the answer as
-- text in the first place.
--
-- Safe to re-run. Safe to run immediately after 0001 on a fresh project.

-- Choice ids are validated in the application against the question they belong
-- to, which a table constraint cannot do — it would have to know that "keep" is
-- legal for gauntlet_day and nonsense for press.
alter table public.answers
  drop constraint if exists answers_choice_check;

-- Branching is gone, so there is no branch to record. Coherence was a score for
-- the old analytical bank; chaos replaces it and drives the Chaos Agent result.
alter table public.sessions drop column if exists branch;
alter table public.sessions drop column if exists coherence;
alter table public.sessions add column if not exists chaos integer;

-- The aggregate functions are unchanged: they always grouped on choice as text
-- and never assumed how many distinct values it could take.
