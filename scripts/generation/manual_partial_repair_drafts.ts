import crypto from "node:crypto";

import { PrismaClient } from "../../app/src/lib/generated/prisma";

type DraftQuestion = {
  stem: string;
  options: Array<{ key: "A" | "B" | "C" | "D" | "E"; text: string }>;
  correctKey: "A" | "B" | "C" | "D" | "E";
  explanation: string;
  whyOthersWrong: Record<string, string>;
  keyTakeaways: string[];
  difficulty: "Basic" | "Intermediate" | "Hard";
  ausScore: number;
  curriculumArea: string;
  moduleCode: string | null;
  citations: Array<{
    type: "internal";
    source: string;
    title: string;
  }>;
};

const OVERLAP_THRESHOLD = 0.35;

const DRAFTS: DraftQuestion[] = [
  {
    stem: "Which post-exposure strategy is most appropriate for a well, unimmunised 3-year-old seen within 72 hours of close household exposure to varicella?",
    options: [
      { key: "A", text: "Give varicella vaccine now" },
      { key: "B", text: "Give VZIG now" },
      { key: "C", text: "Start intravenous aciclovir" },
      { key: "D", text: "Start oral aciclovir immediately" },
      { key: "E", text: "Use paracetamol only and review if symptoms develop" },
    ],
    correctKey: "A",
    explanation: "For a healthy unimmunised child older than 12 months, prompt post-exposure varicella vaccination is the preferred preventive step. VZIG is reserved for selected high-risk contacts rather than routine use in an otherwise well preschool child.",
    whyOthersWrong: {
      B: "VZIG is used for higher-risk exposed contacts, not as first-line prophylaxis for a healthy child in this scenario.",
      C: "Intravenous aciclovir is treatment for severe disease, not routine post-exposure prophylaxis here.",
      D: "Oral aciclovir is not the preferred immediate strategy when timely vaccination is appropriate.",
      E: "Observation alone misses an opportunity for effective post-exposure prevention.",
    },
    keyTakeaways: [
      "Healthy unimmunised children can be managed differently from immunocompromised contacts after varicella exposure.",
      "Post-exposure vaccination is time-sensitive and most useful when given early.",
      "VZIG is reserved for selected high-risk exposures rather than routine household contacts.",
    ],
    difficulty: "Intermediate",
    ausScore: 3,
    curriculumArea: "Community-based Paediatrics",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - Term I 2012.docx",
        title: "Stage 3 CAH - Remembered Questions (with Answers) - Term I 2012.docx",
      },
    ],
  },
  {
    stem: "A 4-year-old with known peanut allergy develops urticaria, angioedema, cough, wheeze and hypotension after eating a biscuit containing peanut. What is the best immediate treatment?",
    options: [
      { key: "A", text: "Intramuscular adrenaline" },
      { key: "B", text: "Intravenous hydrocortisone" },
      { key: "C", text: "Oral antihistamine" },
      { key: "D", text: "Nebulised salbutamol alone" },
      { key: "E", text: "Supplemental oxygen first, then observe response" },
    ],
    correctKey: "A",
    explanation: "This child has anaphylaxis because there is multisystem involvement with hypotension and respiratory features. Intramuscular adrenaline is the first-line treatment and should not be delayed for adjunctive therapies.",
    whyOthersWrong: {
      B: "Steroids may be used later as adjuncts but do not reverse anaphylaxis rapidly enough to be first-line.",
      C: "Antihistamines can help cutaneous symptoms but are inadequate for anaphylaxis with airway or circulatory compromise.",
      D: "Bronchodilators may help wheeze but do not treat the underlying anaphylactic reaction.",
      E: "Oxygen is supportive; it should not replace prompt adrenaline in anaphylaxis.",
    },
    keyTakeaways: [
      "Hypotension plus wheeze after allergen exposure is anaphylaxis.",
      "Intramuscular adrenaline is the first-line treatment for anaphylaxis.",
      "Supportive measures and adjuncts must not delay adrenaline.",
    ],
    difficulty: "Intermediate",
    ausScore: 4,
    curriculumArea: "Emergency Paediatrics",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Questions (with Answers) - Block E 2012.docx",
        title: "Stage 3 CAH - Questions (with Answers) - Block E 2012.docx",
      },
    ],
  },
  {
    stem: "A 7-day-old boy is found to have bilateral hydronephrosis on investigation. Which diagnosis is most likely?",
    options: [
      { key: "A", text: "Posterior urethral valves" },
      { key: "B", text: "VACTERL association" },
      { key: "C", text: "Ureterocele" },
      { key: "D", text: "Renal calculi" },
      { key: "E", text: "Childhood malignancy" },
    ],
    correctKey: "A",
    explanation: "Posterior urethral valves are a classic obstructive cause of bilateral hydronephrosis in a male neonate. The pattern strongly suggests lower urinary tract obstruction rather than a later-acquired pathology.",
    whyOthersWrong: {
      B: "VACTERL is a syndromic association, not the single most likely explanation for isolated bilateral hydronephrosis here.",
      C: "A ureterocele may obstruct but is less classic than posterior urethral valves in this neonatal presentation.",
      D: "Renal stones are uncommon as the primary explanation for bilateral neonatal hydronephrosis.",
      E: "Malignancy is not the leading cause of bilateral hydronephrosis in a 7-day-old infant.",
    },
    keyTakeaways: [
      "Bilateral hydronephrosis in a newborn boy should prompt consideration of lower urinary tract obstruction.",
      "Posterior urethral valves are a classic neonatal cause of obstructive uropathy.",
      "Neonatal timing helps distinguish congenital obstruction from later-acquired causes.",
    ],
    difficulty: "Intermediate",
    ausScore: 4,
    curriculumArea: "Paediatric Surgery",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
        title: "Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
      },
    ],
  },
  {
    stem: "A 7-year-old has persistent fever, conjunctival injection, red oral mucosa, swollen hands and a polymorphous rash. What is the best initial disease-specific treatment?",
    options: [
      { key: "A", text: "Intravenous immunoglobulin" },
      { key: "B", text: "Intravenous ampicillin" },
      { key: "C", text: "Oral antihistamine" },
      { key: "D", text: "Systemic corticosteroids alone" },
      { key: "E", text: "Supportive care only" },
    ],
    correctKey: "A",
    explanation: "This presentation is most consistent with Kawasaki disease. Intravenous immunoglobulin is the key initial disease-specific therapy because it reduces the risk of coronary complications.",
    whyOthersWrong: {
      B: "Antibiotics do not treat the inflammatory vasculitis driving Kawasaki disease.",
      C: "Antihistamines may reduce itch but do not treat the underlying condition.",
      D: "Steroids may be used in selected circumstances, but they are not the standard single best initial therapy here.",
      E: "Supportive care alone leaves the child exposed to preventable coronary complications.",
    },
    keyTakeaways: [
      "Kawasaki disease presents with prolonged fever plus mucocutaneous and extremity findings.",
      "Intravenous immunoglobulin is a cornerstone of initial treatment.",
      "Early treatment aims to reduce coronary artery complications.",
    ],
    difficulty: "Intermediate",
    ausScore: 4,
    curriculumArea: "General Paediatrics",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
        title: "Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
      },
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Questions (with Answers) - Block E 2012.docx",
        title: "Stage 3 CAH - Questions (with Answers) - Block E 2012.docx",
      },
    ],
  },
  {
    stem: "An 8-week-old infant has bilious vomiting and an abdominal radiograph showing no gas beyond the duodenum. Which diagnosis best fits this presentation?",
    options: [
      { key: "A", text: "Malrotation with volvulus" },
      { key: "B", text: "Pyloric stenosis" },
      { key: "C", text: "Gastro-oesophageal reflux" },
      { key: "D", text: "Urinary tract infection" },
      { key: "E", text: "Cow's milk protein allergy" },
    ],
    correctKey: "A",
    explanation: "Bilious vomiting in early infancy is an obstruction until proven otherwise. Gasless bowel distal to the duodenum strongly points to malrotation with volvulus and requires urgent surgical escalation.",
    whyOthersWrong: {
      B: "Pyloric stenosis causes non-bilious vomiting because the obstruction is proximal to the ampulla.",
      C: "Reflux does not explain bilious emesis with radiographic evidence of intestinal obstruction.",
      D: "A UTI can cause vomiting but not this obstructive abdominal radiograph pattern.",
      E: "Milk protein allergy may cause feeding intolerance but not the classic gasless distal bowel picture.",
    },
    keyTakeaways: [
      "Bilious vomiting in an infant should raise immediate concern for intestinal obstruction.",
      "Malrotation with volvulus is a surgical emergency.",
      "Radiographic paucity of distal bowel gas supports a proximal obstructive process.",
    ],
    difficulty: "Intermediate",
    ausScore: 4,
    curriculumArea: "Paediatric Surgery",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Questions (with Answers) - 2012 July.docx",
        title: "Stage 3 CAH - Questions (with Answers) - 2012 July.docx",
      },
    ],
  },
  {
    stem: "A toddler has failure to thrive, chronic gastrointestinal symptoms and total villous atrophy on biopsy. Serum tTG IgA is absent, but total IgA is low. What is the most likely diagnosis?",
    options: [
      { key: "A", text: "Coeliac disease" },
      { key: "B", text: "Crohn disease" },
      { key: "C", text: "Ulcerative colitis" },
      { key: "D", text: "Milk protein allergy" },
      { key: "E", text: "Infective enterocolitis" },
    ],
    correctKey: "A",
    explanation: "Low total IgA can make IgA-based serology falsely reassuring. In a child with compatible symptoms and total villous atrophy, coeliac disease is the best fit.",
    whyOthersWrong: {
      B: "Crohn disease does not classically cause isolated total villous atrophy with this serological issue.",
      C: "Ulcerative colitis affects the colon rather than causing this small-bowel mucosal pattern.",
      D: "Milk protein allergy can cause gastrointestinal symptoms but does not best explain total villous atrophy in this context.",
      E: "Infective enterocolitis is less likely with the chronic picture and biopsy findings described.",
    },
    keyTakeaways: [
      "Selective IgA deficiency can complicate interpretation of coeliac serology.",
      "Villous atrophy remains a major diagnostic clue to coeliac disease.",
      "Biopsy findings should be interpreted alongside the child’s symptoms and immunoglobulin profile.",
    ],
    difficulty: "Intermediate",
    ausScore: 4,
    curriculumArea: "Paediatric Sub-specialties",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
        title: "Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
      },
      {
        type: "internal",
        source: "import_source/questions/Paeds/Past Questions/Paeds Exam July TERM I 2012.docx",
        title: "Paeds Exam July TERM I 2012.docx",
      },
    ],
  },
  {
    stem: "Which analyte is primarily measured on newborn screening as the initial test for cystic fibrosis?",
    options: [
      { key: "A", text: "Immunoreactive trypsin" },
      { key: "B", text: "Sweat chloride" },
      { key: "C", text: "Faecal elastase" },
      { key: "D", text: "Serum chloride" },
      { key: "E", text: "Delta F508 level in blood" },
    ],
    correctKey: "A",
    explanation: "The screening program initially uses immunoreactive trypsin as the key analyte. Diagnostic confirmation then relies on follow-up testing rather than newborn screening being based on sweat chloride alone.",
    whyOthersWrong: {
      B: "Sweat chloride is confirmatory testing, not the usual first newborn screening analyte.",
      C: "Faecal elastase assesses pancreatic function and is not the standard newborn screen.",
      D: "Serum chloride is not the initial newborn screening test for cystic fibrosis.",
      E: "Mutation analysis may be used in follow-up pathways, but the initial screen is not simply a blood level of Delta F508.",
    },
    keyTakeaways: [
      "Screening and diagnosis are not the same step in cystic fibrosis care.",
      "Immunoreactive trypsin is the key initial newborn screening analyte.",
      "Abnormal screening requires targeted confirmatory testing.",
    ],
    difficulty: "Basic",
    ausScore: 3,
    curriculumArea: "Paediatric Sub-specialties",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
        title: "Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
      },
    ],
  },
  {
    stem: "Which feature is least central to a safe and effective transition from paediatric to adult care?",
    options: [
      { key: "A", text: "Beginning planning in early adolescence" },
      { key: "B", text: "Using a structured transition checklist" },
      { key: "C", text: "Assessing readiness over time" },
      { key: "D", text: "Involving the young person in decisions" },
      { key: "E", text: "Insisting transfer must be to an adult subspecialist rather than a GP" },
    ],
    correctKey: "E",
    explanation: "Good transition depends on readiness, planning and continuity rather than a rigid rule about the exact adult destination. Some young people need subspecialist follow-up, but others can transition safely via primary care.",
    whyOthersWrong: {
      A: "Early planning is a core principle of good transition practice.",
      B: "A checklist helps make transition structured and reproducible.",
      C: "Readiness assessment is central because transition is a process, not a single event.",
      D: "Young-person involvement is essential for effective adolescent care.",
    },
    keyTakeaways: [
      "Transition is a developmental process rather than a one-off transfer.",
      "Structure and readiness matter more than a rigid adult service destination.",
      "Adolescent involvement is a core feature of good transition planning.",
    ],
    difficulty: "Intermediate",
    ausScore: 3,
    curriculumArea: "Adolescent Medicine",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - Term H 2012.docx",
        title: "Stage 3 CAH - Remembered Questions (with Answers) - Term H 2012.docx",
      },
    ],
  },
  {
    stem: "A 2-month-old has paroxysmal coughing, occasional post-tussive vomiting and brief apnoeic episodes. His mother has had a prolonged similar cough. Which statement best explains why pertussis remains likely despite routine infant immunisation?",
    options: [
      { key: "A", text: "The vaccine schedule is not yet fully protective at this age" },
      { key: "B", text: "There is no effective pertussis vaccine in infancy" },
      { key: "C", text: "Maternal antibodies completely prevent serological diagnosis" },
      { key: "D", text: "Pertussis vaccination only works after the preschool booster" },
      { key: "E", text: "Infants only become susceptible after 6 months of age" },
    ],
    correctKey: "A",
    explanation: "Young infants may still develop pertussis because they have not yet had time to achieve full protection from the vaccine schedule. The pattern of paroxysmal cough, apnoea and maternal contact remains highly concerning.",
    whyOthersWrong: {
      B: "Pertussis vaccines are effective; the issue here is incomplete protection early in the schedule, not absence of a vaccine.",
      C: "Maternal antibodies do not fully explain the clinical vulnerability described here.",
      D: "Protection begins earlier than the preschool booster, even if it is not yet complete in a 2-month-old.",
      E: "Young infants are among the most vulnerable age groups for pertussis complications.",
    },
    keyTakeaways: [
      "Pertussis in early infancy can present with apnoea and post-tussive vomiting.",
      "Early routine vaccination may be incomplete rather than ineffective.",
      "A maternal history of prolonged cough is an important epidemiological clue.",
    ],
    difficulty: "Intermediate",
    ausScore: 3,
    curriculumArea: "Community-based Paediatrics",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Summary of Remembered Exam Questions - Term E 2011.docx",
        title: "Stage 3 CAH - Summary of Remembered Exam Questions - Term E 2011.docx",
      },
    ],
  },
  {
    stem: "Parents regularly supply alcohol for their 15-year-old son and his friends. Which long-term outcome is the most likely consequence of this pattern?",
    options: [
      { key: "A", text: "Alcohol dependence" },
      { key: "B", text: "Pancreatitis during the next week" },
      { key: "C", text: "Immediate cirrhosis" },
      { key: "D", text: "Compulsory reduction in school attendance" },
      { key: "E", text: "Inevitable psychosis before age 18" },
    ],
    correctKey: "A",
    explanation: "Regular adolescent exposure to supplied alcohol is most strongly associated with later problematic alcohol use and dependence. The stem asks about the most likely long-term consequence, not the most dramatic short-term complication.",
    whyOthersWrong: {
      B: "Pancreatitis is possible with alcohol misuse but is not the most likely long-term consequence implied by this scenario.",
      C: "Cirrhosis does not develop immediately and is not the most likely consequence framed here.",
      D: "School effects may occur, but the best answer is the later risk of dependence.",
      E: "Psychosis is not the inevitable or most likely consequence of supplied alcohol alone.",
    },
    keyTakeaways: [
      "Adolescent alcohol exposure has important long-term consequences beyond acute intoxication.",
      "Parental supply is not a protective strategy against harmful alcohol use.",
      "Exam stems may ask for the most likely long-term rather than the most dramatic outcome.",
    ],
    difficulty: "Basic",
    ausScore: 2,
    curriculumArea: "Adolescent Medicine",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Questions (with Answers) - Block E 2012.docx",
        title: "Stage 3 CAH - Questions (with Answers) - Block E 2012.docx",
      },
    ],
  },
  {
    stem: "An unimmunised Aboriginal girl presents with high fever, drooling and severe upper-airway symptoms. Which organism is the most likely cause?",
    options: [
      { key: "A", text: "Haemophilus influenzae type b" },
      { key: "B", text: "Respiratory syncytial virus" },
      { key: "C", text: "Parainfluenza virus" },
      { key: "D", text: "Staphylococcus aureus" },
      { key: "E", text: "Streptococcus pneumoniae" },
    ],
    correctKey: "A",
    explanation: "In an unimmunised child with drooling and high fever, Hib remains the classic pathogen to think of for invasive upper-airway disease. The immunisation history is a major clue in the stem.",
    whyOthersWrong: {
      B: "RSV usually causes bronchiolitis rather than this classic drooling upper-airway picture.",
      C: "Parainfluenza is associated with croup, which is typically less toxic and does not classically hinge on Hib immunisation status.",
      D: "Staphylococcus aureus can cause severe infection but is not the classic best answer here.",
      E: "Streptococcus pneumoniae is important in paediatrics but is less characteristic than Hib for this stem.",
    },
    keyTakeaways: [
      "Immunisation history can be decisive in upper-airway infectious differentials.",
      "Drooling with toxic features should trigger concern for serious upper-airway infection.",
      "Hib remains a classic exam association when vaccination status is incomplete.",
    ],
    difficulty: "Intermediate",
    ausScore: 3,
    curriculumArea: "Community-based Paediatrics",
    moduleCode: null,
    citations: [
      {
        type: "internal",
        source: "import_source/questions/Stage 3 HMD Notes + Questions/Old exam questions/Stage 3 - Past Papers/cah/MCQs/Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
        title: "Stage 3 CAH - Remembered Questions (with Answers) - 2012 Term G.docx",
      },
    ],
  },
];

function normalizeStem(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\\s]/g, " ").replace(/\\s+/g, " ").trim();
}

function trigramOverlap(a: string, b: string) {
  const aNorm = normalizeStem(a);
  const bNorm = normalizeStem(b);
  const aGrams = new Set<string>();
  const bGrams = new Set<string>();

  for (let i = 0; i < aNorm.length - 2; i += 1) aGrams.add(aNorm.slice(i, i + 3));
  for (let i = 0; i < bNorm.length - 2; i += 1) bGrams.add(bNorm.slice(i, i + 3));
  if (aGrams.size === 0 || bGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection += 1;
  }

  return intersection / Math.max(aGrams.size, bGrams.size);
}

function hashStem(stem: string) {
  return crypto.createHash("sha256").update(normalizeStem(stem)).digest("hex").slice(0, 16);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();

  try {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true, email: true },
    });
    if (!admin) {
      throw new Error("No admin user found.");
    }

    const published = await prisma.question.findMany({
      where: { status: "published" },
      select: { id: true, stem: true },
    });

    const overlapReport = DRAFTS.map((draft) => {
      let maxOverlap = 0;
      let overlapQuestionId: string | null = null;
      for (const existing of published) {
        const overlap = trigramOverlap(draft.stem, existing.stem);
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          overlapQuestionId = existing.id;
        }
      }
      return {
        stem: draft.stem,
        curriculumArea: draft.curriculumArea,
        maxOverlap,
        overlapQuestionId,
      };
    });

    const rejected = overlapReport.filter((item) => item.maxOverlap >= OVERLAP_THRESHOLD);
    console.log(JSON.stringify({ dryRun, totalDrafts: DRAFTS.length, overlapReport, rejected }, null, 2));
    if (dryRun || rejected.length > 0) {
      return;
    }

    const curriculumTags = await prisma.tag.findMany({
      where: { kind: "topic", name: { in: Array.from(new Set(DRAFTS.map((draft) => draft.curriculumArea))) } },
      select: { id: true, name: true },
    });
    const curriculumTagIdByName = new Map(curriculumTags.map((tag) => [tag.name, tag.id]));

    const run = await prisma.generatedQuestionRun.create({
      data: {
        userId: admin.id,
        weaknessTags: DRAFTS.map((draft) => ({
          name: draft.curriculumArea,
          sourceRefs: draft.citations.map((citation) => citation.source),
        })),
        strictness: "strict_internal",
        status: "processing",
        logs: {
          mode: "manual_partial_repair",
          overlapThreshold: OVERLAP_THRESHOLD,
          notes: [
            "Original draft questions created from partial remembered-question corpus.",
            "Overlap screen passed locally.",
            "Embedding-based cosine similarity was unavailable because the configured OPENAI_API_KEY is invalid.",
          ],
        },
      },
      select: { id: true },
    });

    let created = 0;
    for (let index = 0; index < DRAFTS.length; index += 1) {
      const draft = DRAFTS[index];
      const overlap = overlapReport[index];
      const sourceFingerprint = `manual-partial-repair-${run.id}-${index + 1}-${hashStem(draft.stem)}`;
      const curriculumTagId = curriculumTagIdByName.get(draft.curriculumArea) ?? null;

      const question = await prisma.question.create({
        data: {
          type: "SBA",
          stem: draft.stem,
          options: draft.options,
          correctKey: draft.correctKey,
          explanation: draft.explanation,
          rationale: draft.keyTakeaways.join("; "),
          whyOthersWrong: draft.whyOthersWrong,
          citations: draft.citations,
          difficulty: draft.difficulty,
          ausScore: draft.ausScore,
          moduleCode: draft.moduleCode,
          createdBy: "ai",
          status: "draft",
          source: {
            generationRunId: run.id,
            strictness: "strict_internal",
            generationMethod: "manual_partial_repair",
            sourceRefs: draft.citations.map((citation) => citation.source),
          },
          sourceFingerprint,
          ...(curriculumTagId
            ? {
                questionTags: {
                  create: [{ tagId: curriculumTagId }],
                },
              }
            : {}),
        },
        select: { id: true },
      });

      await prisma.generatedQuestionItem.create({
        data: {
          runId: run.id,
          questionId: question.id,
          status: "draft",
          overlapScore: overlap.maxOverlap,
          similarityScore: null,
          validationErrors: {
            similarity: {
              overlapQuestionId: overlap.overlapQuestionId,
              cosineSkipped: "invalid_api_key",
              overlapOnly: true,
            },
          },
          reviewerNotes: "Manual partial-question repair draft created from internal remembered-question corpus.",
        },
      });

      created += 1;
    }

    await prisma.generatedQuestionRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        logs: {
          mode: "manual_partial_repair",
          created,
          overlapThreshold: OVERLAP_THRESHOLD,
          notes: [
            "Original draft questions created from partial remembered-question corpus.",
            "Overlap screen passed locally.",
            "Embedding-based cosine similarity was unavailable because the configured OPENAI_API_KEY is invalid.",
          ],
        },
      },
    });

    console.log(JSON.stringify({ persistedRunId: run.id, created }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
