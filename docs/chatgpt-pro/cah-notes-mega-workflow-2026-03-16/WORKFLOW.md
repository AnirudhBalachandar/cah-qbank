# Workflow

## Stage 1: Master Plan

Goal:

- extract the real subtopic coverage from the notes
- create a plan for **1000+ total questions**
- break that into many small generation batches

Output you want from ChatGPT Pro:

- a complete subtopic list
- suggested question targets per subtopic
- a batch schedule
- total target >= 1000 questions

No questions should be generated yet.

## Stage 2: Generate One Batch

Goal:

- generate one small, focused batch only
- usually 10 to 14 questions
- use Louisa notes first, CAH Bible second, question zip third

Important:

- one batch should cover only a narrow set of subtopics
- if a subtopic is very broad, split it again
- if a concept feels too close to past-question wording, skip it

## Stage 3: Continue or Resume

Goal:

- continue the same batch if the answer was cut off
- or resume later without changing the subtopic scope

## Stage 4: Coverage Audit

Goal:

- review which subtopics are already covered
- identify weak or under-covered areas
- recommend the next 5 to 10 batches

## Codex Loop

After each generation batch:

1. paste the JSON into Codex
2. Codex runs the offline originality screen
3. only accepted questions should be imported
4. rejected batches should inform the next prompt, not be imported
