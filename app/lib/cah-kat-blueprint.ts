import { Question, normalizeTagSlug } from "@cah/domain"

import type { TagDescriptor } from "./question-files"

export type BlueprintSubtopic = {
  slug: string
  name: string
  aliases: string[]
}

export type BlueprintCategory = {
  slug: string
  name: string
  examQuestionCount: number
  examPercent: number
  aliases: string[]
  subtopics: BlueprintSubtopic[]
}

type QuestionProjectionInput = Pick<Question, "curriculum" | "tags" | "stem" | "explanation" | "rationale" | "moduleCode" | "source">

export const blueprintCategories: BlueprintCategory[] = [
  {
    slug: "general-paediatrics",
    name: "General Paediatrics",
    examQuestionCount: 16,
    examPercent: 26.7,
    aliases: ["general paediatrics", "growth", "development", "nutrition", "well child"],
    subtopics: [
      {
        slug: "general-paediatrics/growth-and-nutrition",
        name: "Growth and Nutrition",
        aliases: ["growth", "nutrition", "feeding", "weight faltering", "growth chart", "vitamin d", "obesity"],
      },
      {
        slug: "general-paediatrics/child-development",
        name: "Child Development",
        aliases: ["development", "milestone", "red flag", "speech delay", "gross motor", "fine motor"],
      },
      {
        slug: "general-paediatrics/common-clinical-conditions",
        name: "Common Clinical Conditions",
        aliases: ["constipation", "fever", "rash", "eczema", "anaemia", "sleep", "enuresis"],
      },
    ],
  },
  {
    slug: "paediatric-sub-specialties",
    name: "Paediatric Sub-specialties",
    examQuestionCount: 12,
    examPercent: 20,
    aliases: ["paediatric sub specialties", "subspecialty", "specialty", "ent", "respiratory", "gastroenterology"],
    subtopics: [
      {
        slug: "paediatric-sub-specialties/ent",
        name: "ENT",
        aliases: ["ent", "ear", "otitis", "hearing", "nose", "epistaxis", "tonsillitis", "throat", "sinusitis"],
      },
      {
        slug: "paediatric-sub-specialties/chronic-respiratory-problems",
        name: "Chronic Respiratory Problems",
        aliases: ["asthma", "cystic fibrosis", "sleep disordered breathing", "chronic respiratory", "wheeze"],
      },
      {
        slug: "paediatric-sub-specialties/allergy",
        name: "Allergy",
        aliases: ["allergy", "anaphylaxis", "ige", "non ige", "cow milk protein", "food allergy"],
      },
      {
        slug: "paediatric-sub-specialties/immunology-and-infection",
        name: "Immunology and Infection",
        aliases: ["immunology", "infection", "meningococcal", "viral exanthem", "sepsis", "immunodeficiency"],
      },
      {
        slug: "paediatric-sub-specialties/gastroenterology",
        name: "Gastroenterology",
        aliases: ["gastroenterology", "malabsorption", "coeliac", "inflammatory bowel", "jaundice", "liver failure"],
      },
      {
        slug: "paediatric-sub-specialties/ophthalmology",
        name: "Ophthalmology",
        aliases: ["ophthalmology", "conjunctivitis", "keratoconjunctivitis", "eye", "vision"],
      },
      {
        slug: "paediatric-sub-specialties/neonatology",
        name: "Neonatology",
        aliases: ["neonatal", "newborn", "prematurity", "jaundice", "resuscitation of the newborn"],
      },
      {
        slug: "paediatric-sub-specialties/other-specialty-systems",
        name: "Other Specialty Systems",
        aliases: ["cardiology", "renal", "endocrine", "neurology", "haematology", "oncology", "rheumatology"],
      },
    ],
  },
  {
    slug: "paediatric-surgery",
    name: "Paediatric Surgery",
    examQuestionCount: 10,
    examPercent: 16.7,
    aliases: ["paediatric surgery", "surgery", "surgical"],
    subtopics: [
      {
        slug: "paediatric-surgery/surgical-abdomen",
        name: "Surgical Abdomen",
        aliases: ["appendicitis", "acute abdomen", "intussusception", "pyloric stenosis", "bowel obstruction"],
      },
      {
        slug: "paediatric-surgery/orthopaedics",
        name: "Orthopaedics",
        aliases: ["orthopaedic", "fracture", "limp", "hip", "bone", "clubfoot"],
      },
      {
        slug: "paediatric-surgery/urology-and-inguinoscrotal",
        name: "Urology and Inguinoscrotal",
        aliases: ["urology", "testicular", "inguinal", "hernia", "undescended", "scrotal", "torsion"],
      },
      {
        slug: "paediatric-surgery/burns-and-trauma",
        name: "Burns and Trauma",
        aliases: ["burn", "trauma", "head injury", "wound"],
      },
      {
        slug: "paediatric-surgery/congenital-surgical-problems",
        name: "Congenital Surgical Problems",
        aliases: ["atresia", "hirschsprung", "congenital surgical", "cleft", "malrotation"],
      },
    ],
  },
  {
    slug: "emergency-paediatrics",
    name: "Emergency Paediatrics",
    examQuestionCount: 10,
    examPercent: 16.7,
    aliases: ["emergency paediatrics", "acute", "resuscitation", "shock"],
    subtopics: [
      {
        slug: "emergency-paediatrics/acute-respiratory-problems",
        name: "Acute Respiratory Problems",
        aliases: ["croup", "epiglottitis", "bronchiolitis", "pneumonia", "respiratory distress", "stridor"],
      },
      {
        slug: "emergency-paediatrics/resuscitation",
        name: "Resuscitation",
        aliases: ["resuscitation", "basic life support", "advanced life support", "arrest"],
      },
      {
        slug: "emergency-paediatrics/sepsis",
        name: "Sepsis",
        aliases: ["sepsis", "septic", "meningitis", "meningococcal"],
      },
      {
        slug: "emergency-paediatrics/dehydration-and-shock",
        name: "Dehydration and Shock",
        aliases: ["dehydration", "shock", "fluid bolus", "hypovolaemia"],
      },
      {
        slug: "emergency-paediatrics/trauma-burns-seizures-and-poisoning",
        name: "Trauma, Burns, Seizures and Poisoning",
        aliases: ["trauma", "burn", "seizure", "poison", "ingestion", "overdose"],
      },
      {
        slug: "emergency-paediatrics/acute-abdomen",
        name: "Acute Abdomen",
        aliases: ["acute abdomen", "abdominal pain", "appendicitis", "intussusception"],
      },
    ],
  },
  {
    slug: "adolescent-medicine",
    name: "Adolescent Medicine",
    examQuestionCount: 6,
    examPercent: 10,
    aliases: ["adolescent", "teenager", "youth"],
    subtopics: [
      {
        slug: "adolescent-medicine/mental-health",
        name: "Mental Health",
        aliases: ["mental health", "depression", "anxiety", "self harm", "suicide"],
      },
      {
        slug: "adolescent-medicine/sexual-health-and-puberty",
        name: "Sexual Health and Puberty",
        aliases: ["sexual health", "puberty", "contraception", "pregnancy", "menstrual"],
      },
      {
        slug: "adolescent-medicine/eating-disorders-and-substance-use",
        name: "Eating Disorders and Substance Use",
        aliases: ["eating disorder", "anorexia", "bulimia", "substance", "alcohol", "vaping"],
      },
      {
        slug: "adolescent-medicine/transition-and-confidentiality",
        name: "Transition and Confidentiality",
        aliases: ["transition", "confidentiality", "consent", "headsss", "independence"],
      },
    ],
  },
  {
    slug: "community-based-paediatrics",
    name: "Community-based Paediatrics",
    examQuestionCount: 6,
    examPercent: 10,
    aliases: ["community based paediatrics", "population health", "prevention"],
    subtopics: [
      {
        slug: "community-based-paediatrics/immunisation",
        name: "Immunisation",
        aliases: ["immunisation", "immunization", "vaccine", "vaccination", "aefi", "nip schedule"],
      },
      {
        slug: "community-based-paediatrics/aboriginal-health",
        name: "Aboriginal Health",
        aliases: ["aboriginal", "torres strait", "first nations", "cultural safety"],
      },
      {
        slug: "community-based-paediatrics/population-health-and-prevention",
        name: "Population Health and Prevention",
        aliases: ["population health", "screening", "prevention", "public health", "injury prevention"],
      },
      {
        slug: "community-based-paediatrics/disability-and-developmental-support",
        name: "Disability and Developmental Support",
        aliases: ["disability", "ndis", "autism", "cerebral palsy", "developmental support"],
      },
      {
        slug: "community-based-paediatrics/evidence-based-medicine",
        name: "Evidence-based Medicine",
        aliases: ["evidence based", "sensitivity", "specificity", "relative risk", "odds ratio", "number needed"],
      },
    ],
  },
]

const blueprintBySlug = new Map(blueprintCategories.map((category) => [category.slug, category]))
const subtopicBySlug = new Map(blueprintCategories.flatMap((category) => category.subtopics.map((topic) => [topic.slug, topic])))

const noisyExactSlugs = new Set([
  "cah-exam-blueprint",
  "cah-exam-blueprint/cah-kat",
  "notebooklm",
  "combined-import",
])

const noisyPrefixes = [
  "combined-import/",
  "notebooklm/",
  "canvas-import/",
  "canvas-practice-quiz/",
  "source/",
  "source-system/",
  "source-collection/",
  "import-set/",
  "promotion/",
  "question-type/",
  "repair-method/",
  "readiness/",
]

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function sourceText(source: QuestionProjectionInput["source"]) {
  if (!source) {
    return ""
  }
  try {
    return JSON.stringify(source)
  } catch {
    return ""
  }
}

function containsAlias(haystack: string, alias: string) {
  const normalizedAlias = normalizeText(alias)
  if (!normalizedAlias) {
    return false
  }
  return ` ${haystack} `.includes(` ${normalizedAlias} `)
}

export function isNoisyLearnerTagSlug(slug: string) {
  return noisyExactSlugs.has(slug) || noisyPrefixes.some((prefix) => slug.startsWith(prefix))
}

export function isBlueprintSlug(slug: string) {
  return blueprintBySlug.has(slug) || subtopicBySlug.has(slug)
}

export function blueprintTagDescriptors(): TagDescriptor[] {
  return blueprintCategories.flatMap((category) => [
    {
      slug: category.slug,
      name: category.name,
      kind: "curriculum" as const,
      parentSlug: null,
    },
    ...category.subtopics.map((topic) => ({
      slug: topic.slug,
      name: topic.name,
      kind: "topic" as const,
      parentSlug: category.slug,
    })),
  ])
}

export function blueprintSlugsForQuestion(question: QuestionProjectionInput) {
  const slugs = new Set<string>()
  const curriculumSlug = normalizeTagSlug(question.curriculum)
  if (blueprintBySlug.has(curriculumSlug)) {
    slugs.add(curriculumSlug)
  }

  const haystack = normalizeText(
    [
      question.curriculum,
      question.moduleCode ?? "",
      question.stem,
      question.explanation ?? "",
      question.rationale ?? "",
      sourceText(question.source),
      ...question.tags,
    ].join(" "),
  )

  for (const category of blueprintCategories) {
    if (category.slug === curriculumSlug || category.aliases.some((alias) => containsAlias(haystack, alias))) {
      slugs.add(category.slug)
    }

    for (const topic of category.subtopics) {
      if (topic.aliases.some((alias) => containsAlias(haystack, alias))) {
        slugs.add(category.slug)
        slugs.add(topic.slug)
      }
    }
  }

  return Array.from(slugs).sort((left, right) => left.localeCompare(right))
}
