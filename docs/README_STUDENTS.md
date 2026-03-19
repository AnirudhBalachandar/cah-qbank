# CAH QBank For Medical Students

CAH QBank is a revision web app for Sydney Medical School Child and Adolescent Health.

It is built for practice, review, and targeted revision. It is not a clinical decision tool and it is not medical advice.

## What Is In The QBank

As of `2026-03-20`, the app contains:

- `2083` total questions
- `1107` published questions ready to use now
- `976` draft questions still awaiting later review or publication

Question formats are MCQ-only:

- `SBA`
- `EMQ_STEM`

The qbank also now includes `1153` NotebookLM-derived questions, all tagged `notebookLM`, with the original CAH curriculum tags added on top.

## Curriculum Breakdown

Questions are tagged so you can revise by area:

- `176` General Paediatrics
- `820` Paediatric Sub-specialties
- `313` Paediatric Surgery
- `174` Emergency Paediatrics
- `146` Adolescent Medicine
- `197` Community-based Paediatrics

These totals reflect tag coverage, so one question can contribute to both its source tag and its curriculum tag.

## What You Can Do In The Web App

- start practice sessions
- focus on weak areas
- run timed or revision-style sessions
- review explanations and option rationales
- flag questions
- keep notes on questions
- track progress over time

## How To Use It

1. Launch the app.
2. Sign in to your local account.
3. Go to the dashboard to see your recent progress and weaker areas.
4. Start a practice session and filter by topic or tag if you want a focused set.
5. Review your answers, explanations, and flagged questions after the session.

## What The Tags Mean

The app uses a hierarchical tagging system to organise questions.

Important examples:

- `CAH Exam Blueprint`
- `CAH KAT`
- the six top-level curriculum areas above
- `notebookLM` for the imported NotebookLM quiz set

That means a question can be found both by its curriculum area and by where it came from.

## Important Notes

- This is for education and revision only.
- It should not be used as medical advice.
- Some questions are published and ready for normal use now.
- Some remain in draft while they are reviewed or improved.
- Generated content goes through extra checking before publication.

## Quick Start

From the project folder:

```bash
cd /Users/anirudhbalachandar/Projects/cah-qbank
./scripts/launch_cah_qbank.sh
```

Health check:

- [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health)

If you only want the realistic built app experience, use:

```bash
./scripts/launch_cah_qbank_production.sh
```
