import type { ExamBlueprintRow } from "@cah-qbank/domain";

type OptionLike = {
  text?: string | null;
};

export type BlueprintMatchInput = {
  stem: string;
  options?: OptionLike[] | null;
  moduleCode?: string | null;
  sourceFile?: string | null;
  sectionTitle?: string | null;
  tagNames?: string[];
};

export type CurriculumAreaScore = {
  curriculumArea: string;
  score: number;
  matchedPhrases: string[];
};

export type BlueprintMatchResult = {
  row: ExamBlueprintRow | null;
  reason: "matched" | "no_curriculum_signal" | "insufficient_curriculum_signal" | "ambiguous_curriculum_signal";
  scores: CurriculumAreaScore[];
};

type WeightedPhrase = {
  phrase: string;
  weight: number;
};

const EXACT_MATCH_WEIGHT = 100;
const MIN_SCORE_MARGIN = 2;

const KEYWORDS_BY_CURRICULUM: Record<string, WeightedPhrase[]> = {
  "Adolescent Medicine": [
    { phrase: "adolescent", weight: 4 },
    { phrase: "teen", weight: 3 },
    { phrase: "transition", weight: 4 },
    { phrase: "anorexia", weight: 4 },
    { phrase: "eating disorder", weight: 4 },
    { phrase: "refeeding", weight: 4 },
    { phrase: "sleep", weight: 3 },
    { phrase: "risk taking", weight: 4 },
    { phrase: "sexual health", weight: 4 },
    { phrase: "substance use", weight: 4 },
    { phrase: "pregnancy", weight: 3 },
    { phrase: "conduct disorder", weight: 4 },
    { phrase: "self harm", weight: 4 },
    { phrase: "chronic illness", weight: 3 },
  ],
  "Community-based Paediatrics": [
    { phrase: "aboriginal", weight: 5 },
    { phrase: "indigenous", weight: 5 },
    { phrase: "torres strait", weight: 5 },
    { phrase: "community", weight: 4 },
    { phrase: "general practice", weight: 4 },
    { phrase: "immunisation", weight: 5 },
    { phrase: "vaccination", weight: 4 },
    { phrase: "vaccinated", weight: 3 },
    { phrase: "acir", weight: 5 },
    { phrase: "vzig", weight: 3 },
    { phrase: "child abuse", weight: 4 },
    { phrase: "non accidental", weight: 4 },
    { phrase: "out of home care", weight: 4 },
    { phrase: "refugee", weight: 4 },
    { phrase: "migrant", weight: 3 },
    { phrase: "agree ii", weight: 3 },
    { phrase: "population", weight: 3 },
    { phrase: "screening", weight: 3 },
  ],
  "Paediatric Surgery": [
    { phrase: "torsion", weight: 5 },
    { phrase: "testis", weight: 4 },
    { phrase: "testicular", weight: 4 },
    { phrase: "pyloric stenosis", weight: 5 },
    { phrase: "malrotation", weight: 5 },
    { phrase: "volvulus", weight: 5 },
    { phrase: "biliary atresia", weight: 5 },
    { phrase: "posterior urethral valves", weight: 5 },
    { phrase: "hydronephrosis", weight: 4 },
    { phrase: "hydrocele", weight: 4 },
    { phrase: "swallowed magnets", weight: 5 },
    { phrase: "fracture", weight: 4 },
    { phrase: "orthopaed", weight: 4 },
    { phrase: "ddh", weight: 4 },
    { phrase: "developmental dysplasia", weight: 4 },
    { phrase: "scfe", weight: 4 },
    { phrase: "perthes", weight: 4 },
    { phrase: "seatbelt injury", weight: 4 },
    { phrase: "orofacial trauma", weight: 4 },
    { phrase: "limping child", weight: 3 },
  ],
  "Emergency Paediatrics": [
    { phrase: "resus", weight: 5 },
    { phrase: "resusc", weight: 5 },
    { phrase: "airway", weight: 4 },
    { phrase: "shock", weight: 4 },
    { phrase: "trauma", weight: 5 },
    { phrase: "head injury", weight: 5 },
    { phrase: "neuro observations", weight: 4 },
    { phrase: "ct scan", weight: 3 },
    { phrase: "bronchiolitis", weight: 4 },
    { phrase: "croup", weight: 4 },
    { phrase: "stridor", weight: 4 },
    { phrase: "drowning", weight: 5 },
    { phrase: "seizure", weight: 3 },
    { phrase: "febrile seizure", weight: 4 },
    { phrase: "meningitis", weight: 4 },
    { phrase: "dehydration", weight: 3 },
    { phrase: "oxygen", weight: 2 },
    { phrase: "adrenaline", weight: 3 },
    { phrase: "hypoglycemia", weight: 3 },
    { phrase: "burn", weight: 3 },
  ],
  "Paediatric Sub-specialties": [
    { phrase: "cardiology", weight: 4 },
    { phrase: "asd", weight: 4 },
    { phrase: "vsd", weight: 4 },
    { phrase: "murmur", weight: 3 },
    { phrase: "renal", weight: 4 },
    { phrase: "neph", weight: 4 },
    { phrase: "jia", weight: 5 },
    { phrase: "juvenile idiopathic arthritis", weight: 5 },
    { phrase: "crohn", weight: 4 },
    { phrase: "coeliac", weight: 4 },
    { phrase: "celiac", weight: 4 },
    { phrase: "hypothyroid", weight: 4 },
    { phrase: "thyroid", weight: 3 },
    { phrase: "diabetes", weight: 4 },
    { phrase: "dysmorphic", weight: 4 },
    { phrase: "di george", weight: 4 },
    { phrase: "genetics", weight: 4 },
    { phrase: "cf", weight: 4 },
    { phrase: "cystic fibrosis", weight: 5 },
    { phrase: "rheumatology", weight: 4 },
    { phrase: "neurology", weight: 4 },
    { phrase: "epilepsy", weight: 4 },
    { phrase: "oncology", weight: 4 },
    { phrase: "ent", weight: 3 },
    { phrase: "ophthalmology", weight: 4 },
  ],
  "General Paediatrics": [
    { phrase: "otitis", weight: 4 },
    { phrase: "gastroenteritis", weight: 4 },
    { phrase: "diarrhoea", weight: 3 },
    { phrase: "vomiting", weight: 2 },
    { phrase: "constipation", weight: 3 },
    { phrase: "reflux", weight: 3 },
    { phrase: "growth chart", weight: 4 },
    { phrase: "development", weight: 3 },
    { phrase: "trisomy 21", weight: 4 },
    { phrase: "down syndrome", weight: 4 },
    { phrase: "kawasaki", weight: 4 },
    { phrase: "anaemia", weight: 3 },
    { phrase: "anemia", weight: 3 },
    { phrase: "measles", weight: 4 },
    { phrase: "varicella", weight: 4 },
    { phrase: "chicken pox", weight: 4 },
    { phrase: "common problems", weight: 3 },
    { phrase: "newborn screening", weight: 3 },
    { phrase: "plagiocephaly", weight: 3 },
    { phrase: "enuresis", weight: 3 },
  ],
};

const MIN_SCORE_BY_CURRICULUM: Record<string, number> = {
  "Adolescent Medicine": 4,
  "Community-based Paediatrics": 4,
  "Paediatric Surgery": 4,
  "Emergency Paediatrics": 4,
  "Paediatric Sub-specialties": 4,
  "General Paediatrics": 4,
};

function normalizeForMatch(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function hasPhrase(haystack: string, phrase: string) {
  return haystack.includes(normalizeForMatch(phrase));
}

export function scoreCurriculumAreas(rows: ExamBlueprintRow[], input: BlueprintMatchInput): CurriculumAreaScore[] {
  const haystack = normalizeForMatch([
    input.stem,
    input.moduleCode ?? "",
    input.sourceFile ?? "",
    input.sectionTitle ?? "",
    ...(input.tagNames ?? []),
    ...((input.options ?? []).map((option) => option.text ?? "")),
  ].join(" "));

  return rows
    .map((row) => {
      const matchedPhrases: string[] = [];
      let score = 0;

      if (hasPhrase(haystack, row.curriculumArea)) {
        matchedPhrases.push(row.curriculumArea);
        score += EXACT_MATCH_WEIGHT;
      }

      for (const rule of KEYWORDS_BY_CURRICULUM[row.curriculumArea] ?? []) {
        if (!hasPhrase(haystack, rule.phrase)) {
          continue;
        }
        matchedPhrases.push(rule.phrase);
        score += rule.weight;
      }

      return {
        curriculumArea: row.curriculumArea,
        score,
        matchedPhrases: Array.from(new Set(matchedPhrases)),
      };
    })
    .sort((a, b) => b.score - a.score || a.curriculumArea.localeCompare(b.curriculumArea));
}

export function matchBlueprintRow(rows: ExamBlueprintRow[], input: BlueprintMatchInput): BlueprintMatchResult {
  const scores = scoreCurriculumAreas(rows, input);
  const best = scores[0];
  const second = scores[1];

  if (!best || best.score === 0) {
    return { row: null, reason: "no_curriculum_signal", scores };
  }

  const minimumScore = MIN_SCORE_BY_CURRICULUM[best.curriculumArea] ?? 4;
  if (best.score < minimumScore) {
    return { row: null, reason: "insufficient_curriculum_signal", scores };
  }

  if (second && second.score > 0 && best.score - second.score < MIN_SCORE_MARGIN) {
    return { row: null, reason: "ambiguous_curriculum_signal", scores };
  }

  const matchedRow = rows.find((row) => row.curriculumArea === best.curriculumArea) ?? null;
  if (!matchedRow) {
    return { row: null, reason: "no_curriculum_signal", scores };
  }

  return {
    row: matchedRow,
    reason: "matched",
    scores,
  };
}
