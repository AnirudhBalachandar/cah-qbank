# Files To Upload Into ChatGPT Pro

Always upload these support files:

- `docs/chatgpt-pro/cah-partial-repair/BLUEPRINT_BRIEF.md`
- `docs/chatgpt-pro/cah-partial-repair/OUTPUT_SPEC.md`
- `content/CAH_qbank/metadata/exam_blueprint.csv`

Upload these CAH question-source documents:

- `content/CAH_qbank/import_source/questions/Paeds/Past Questions/CAH MCQs - Term H.docx`
- `content/CAH_qbank/import_source/questions/Paeds/Past Questions/Paeds Exam July TERM I 2012.docx`
- `content/CAH_qbank/import_source/questions/Paeds/Past Questions/Paeds exam MCQs.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Online Practical Questions (with Answers) - 2014 September.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Questions (with Answers) - 2012 July.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Questions (with Answers) - 2014 Term D.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Questions (with Answers) - Block E 2012.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - 2011 Term D.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - Term H 2012.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - Term I 2012.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers).docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions - 2012 Term G.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions - September 2014.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Summary of Remembered Exam Questions - 2013.docx`
- `content/CAH_qbank/import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Summary of Remembered Exam Questions - Term E 2011.docx`

If ChatGPT Pro struggles with too many uploads at once:

- Keep `BLUEPRINT_BRIEF.md`, `OUTPUT_SPEC.md`, and `exam_blueprint.csv` attached every time.
- Split the 16 DOCX files into two passes:
  - Pass 1: the first 8 DOCX files above
  - Pass 2: the remaining 8 DOCX files above
- Use `PROMPT_INITIAL.md` for the first pass and `PROMPT_CONTINUE.md` for follow-up passes in the same chat.

Optional later grounding if a fragment is too thin:

- Add the most relevant notes from `content/CAH_qbank/import_source/notes`
- Only do this if you need extra internal support for a weak remembered fragment
