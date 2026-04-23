import fs from "node:fs/promises"
import path from "node:path"

import { normalizeTagSlug, questionSchema, type Curriculum, type Question } from "@cah/domain"

const repoRoot = process.cwd()
const draftsDir = path.join(repoRoot, "drafts")
const manifestPath = path.join(draftsDir, "_imports", "combined-canvas-notebooklm-v1", "manifest.json")
const taggingMethod = "mindmap_source_map_v1"
const mindmapPath =
  "/Users/anirudhbalachandar/Projects/notebookLM/outputs/notebooklm_mindmaps/cah_study_notes_01_24_combined_curriculum_area/combined_curriculum_area_mindmap.json"

type ImportManifest = {
  ids: string[]
}

type TagDecision = {
  curriculum: Curriculum
  reason: string
  mappingKey: string
}

const canvasCurriculumByTitle: Record<string, TagDecision> = {
  "Practice Quiz: ADHD and ODD": {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped to the Community/Developmental Paediatrics branch via ADHD and behavioural-development content.",
    mappingKey: "canvas:title:Practice Quiz: ADHD and ODD",
  },
  "Practice Quiz: Asthma": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Asthma",
  },
  "Practice Quiz: Asthma Action Plan": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Asthma Action Plan",
  },
  "Practice Quiz: Asthma Management: Medications and Devices - Part A": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Asthma Management: Medications and Devices - Part A",
  },
  "Practice Quiz: Asthma Management: Medications and Devices - Part B": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Asthma Management: Medications and Devices - Part B",
  },
  "Practice Quiz: Burns": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Burns Management within the Paediatric Surgery and Trauma branch.",
    mappingKey: "canvas:title:Practice Quiz: Burns",
  },
  "Practice Quiz: Chest X-Ray - Part A": {
    curriculum: "General Paediatrics",
    reason: "Mapped to Paediatric Procedural Skills and Medical Imaging within General Paediatrics.",
    mappingKey: "canvas:title:Practice Quiz: Chest X-Ray - Part A",
  },
  "Practice Quiz: Chest X-Ray - Part B": {
    curriculum: "General Paediatrics",
    reason: "Mapped to Paediatric Procedural Skills and Medical Imaging within General Paediatrics.",
    mappingKey: "canvas:title:Practice Quiz: Chest X-Ray - Part B",
  },
  "Practice Quiz: Chest X-Ray - Part C": {
    curriculum: "General Paediatrics",
    reason: "Mapped to Paediatric Procedural Skills and Medical Imaging within General Paediatrics.",
    mappingKey: "canvas:title:Practice Quiz: Chest X-Ray - Part C",
  },
  "Practice Quiz: Congenital Surgical Problems": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to congenital defects and neonatal surgical pathology within Paediatric Surgery.",
    mappingKey: "canvas:title:Practice Quiz: Congenital Surgical Problems",
  },
  "Practice Quiz: CSF": {
    curriculum: "General Paediatrics",
    reason: "Mapped to Lumbar Puncture and CSF interpretation under Paediatric Procedural Skills and Medical Imaging.",
    mappingKey: "canvas:title:Practice Quiz: CSF",
  },
  "Practice Quiz: Dermatology": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Dermatology within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Dermatology",
  },
  "Practice Quiz: Dose Calculation": {
    curriculum: "General Paediatrics",
    reason: "Mapped as core general-paediatric therapeutics content outside a subspecialty or emergency-specific branch.",
    mappingKey: "canvas:title:Practice Quiz: Dose Calculation",
  },
  "Practice Quiz: Ear & Nose": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to the ENT (Paediatric) branch within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Ear & Nose",
  },
  "Practice Quiz: Emergency Medicine - Abdominal pain": {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to the Paediatric Emergency Medicine branch.",
    mappingKey: "canvas:title:Practice Quiz: Emergency Medicine - Abdominal pain",
  },
  "Practice Quiz: Emergency Medicine - Breathing difficulties": {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to respiratory emergencies within Paediatric Emergency Medicine.",
    mappingKey: "canvas:title:Practice Quiz: Emergency Medicine - Breathing difficulties",
  },
  "Practice Quiz: Emergency Medicine - Fever": {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to fever management and sick-child recognition within Paediatric Emergency Medicine.",
    mappingKey: "canvas:title:Practice Quiz: Emergency Medicine - Fever",
  },
  "Practice Quiz: Emergency Medicine - Seizures": {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to seizure assessment within Paediatric Emergency Medicine.",
    mappingKey: "canvas:title:Practice Quiz: Emergency Medicine - Seizures",
  },
  "Practice Quiz: Emergency medicine - Trauma 1 - Primary survey": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Trauma and Primary Survey (ABCDE) inside the Paediatric Surgery and Trauma branch.",
    mappingKey: "canvas:title:Practice Quiz: Emergency medicine - Trauma 1 - Primary survey",
  },
  "Practice Quiz: Emergency Medicine - Trauma 2 - Pain": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Pain Management and Trauma inside the Paediatric Surgery and Trauma branch.",
    mappingKey: "canvas:title:Practice Quiz: Emergency Medicine - Trauma 2 - Pain",
  },
  "Practice Quiz: Emergency medicine - Trauma 3 - Head injury": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Trauma and PREDICT Head Injury Algorithm inside the Paediatric Surgery and Trauma branch.",
    mappingKey: "canvas:title:Practice Quiz: Emergency medicine - Trauma 3 - Head injury",
  },
  "Practice Quiz: Evidence Based Medicine": {
    curriculum: "General Paediatrics",
    reason: "Mapped as general core paediatric clinical reasoning and evidence appraisal content.",
    mappingKey: "canvas:title:Practice Quiz: Evidence Based Medicine",
  },
  "Practice Quiz: Fluid Management": {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to Fluid and Electrolyte Therapy within Paediatric Emergency Medicine.",
    mappingKey: "canvas:title:Practice Quiz: Fluid Management",
  },
  "Practice Quiz: Food Allergy": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Adverse Food Reaction within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Food Allergy",
  },
  "Practice Quiz: Fractures": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to orthopaedics and trauma within Paediatric Surgery.",
    mappingKey: "canvas:title:Practice Quiz: Fractures",
  },
  "Practice Quiz: General Paediatrics": {
    curriculum: "General Paediatrics",
    reason: "Mapped directly to the General Paediatrics branch.",
    mappingKey: "canvas:title:Practice Quiz: General Paediatrics",
  },
  "Practice Quiz: GIT Xray": {
    curriculum: "General Paediatrics",
    reason: "Mapped to Abdominal Imaging within Paediatric Procedural Skills and Medical Imaging.",
    mappingKey: "canvas:title:Practice Quiz: GIT Xray",
  },
  "Practice Quiz: Global Perspectives": {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped as population and global-child-health content closest to the community-based branch.",
    mappingKey: "canvas:title:Practice Quiz: Global Perspectives",
  },
  "Practice Quiz: Head and neck lumps": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Neck Lumps within the Paediatric Surgery and Trauma branch.",
    mappingKey: "canvas:title:Practice Quiz: Head and neck lumps",
  },
  "Practice Quiz: Inguino-scrotal disorders": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Inguino-Scrotal and Penile pathology within the Paediatric Surgery and Trauma branch.",
    mappingKey: "canvas:title:Practice Quiz: Inguino-scrotal disorders",
  },
  "Practice Quiz: Malabsorption": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Gastroenterology within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Malabsorption",
  },
  "Practice Quiz: Microbiology": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Infectious Disease and Immunization within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Microbiology",
  },
  "Practice Quiz: Neurology - Part A": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to neurology within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Neurology - Part A",
  },
  "Practice Quiz: Neurology - Part B": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to neurology within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Neurology - Part B",
  },
  "Practice Quiz: Ophthalmology": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Ophthalmology in Children within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Ophthalmology",
  },
  "Practice Quiz: Paediatric Infections in Australia": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Infectious Disease and Immunization within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Paediatric Infections in Australia",
  },
  "Practice Quiz: Pain Management": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Pain Management within the Paediatric Surgery and Trauma branch.",
    mappingKey: "canvas:title:Practice Quiz: Pain Management",
  },
  "Practice Quiz: Penile Pathology": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Inguino-Scrotal and Penile pathology within the Paediatric Surgery and Trauma branch.",
    mappingKey: "canvas:title:Practice Quiz: Penile Pathology",
  },
  "Practice Quiz: Sleep": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to sleep-disordered breathing and specialist respiratory/ENT sleep content.",
    mappingKey: "canvas:title:Practice Quiz: Sleep",
  },
  "Practice Quiz: Surgical Abdominal Pain": {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to surgical abdominal pathology within Paediatric Surgery.",
    mappingKey: "canvas:title:Practice Quiz: Surgical Abdominal Pain",
  },
  "Practice Quiz: Throat": {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to the ENT (Paediatric) branch within Paediatric Sub-specialties.",
    mappingKey: "canvas:title:Practice Quiz: Throat",
  },
  "Practice Quiz: Vomiting": {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to gastrointestinal and surgical emergencies within Paediatric Emergency Medicine.",
    mappingKey: "canvas:title:Practice Quiz: Vomiting",
  },
}

const notebookCurriculumByQuizId: Record<string, TagDecision> = {
  quiz_001: {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped to Child Protection within the community-based branch.",
    mappingKey: "notebook:quiz_001",
  },
  quiz_002: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to the ENT (Paediatric) branch via otology.",
    mappingKey: "notebook:quiz_002",
  },
  quiz_003: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to the ENT (Paediatric) branch via rhinology.",
    mappingKey: "notebook:quiz_003",
  },
  quiz_004: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to the ENT (Paediatric) branch via throat pathology.",
    mappingKey: "notebook:quiz_004",
  },
  quiz_005: {
    curriculum: "General Paediatrics",
    reason: "Mapped to BRUE under Acute Concerns in General Paediatrics.",
    mappingKey: "notebook:quiz_005",
  },
  quiz_006: {
    curriculum: "General Paediatrics",
    reason: "Mapped to common gastrointestinal conditions in General Paediatrics.",
    mappingKey: "notebook:quiz_006",
  },
  quiz_007: {
    curriculum: "General Paediatrics",
    reason: "Mapped to lactose intolerance within common paediatric conditions.",
    mappingKey: "notebook:quiz_007",
  },
  quiz_008: {
    curriculum: "General Paediatrics",
    reason: "Mapped to nocturnal enuresis within common paediatric conditions.",
    mappingKey: "notebook:quiz_008",
  },
  quiz_009: {
    curriculum: "General Paediatrics",
    reason: "Mapped to common paediatric gastrointestinal and vomiting presentations.",
    mappingKey: "notebook:quiz_009",
  },
  quiz_010: {
    curriculum: "General Paediatrics",
    reason: "Mapped to Vitamin D deficiency within General Paediatrics.",
    mappingKey: "notebook:quiz_010",
  },
  quiz_011: {
    curriculum: "General Paediatrics",
    reason: "Mapped to Paediatric Procedural Skills and Medical Imaging.",
    mappingKey: "notebook:quiz_011",
  },
  quiz_012: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_012",
  },
  quiz_013: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_013",
  },
  quiz_014: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_014",
  },
  quiz_015: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_015",
  },
  quiz_016: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_016",
  },
  quiz_017: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health via cystic fibrosis content.",
    mappingKey: "notebook:quiz_017",
  },
  quiz_018: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Respiratory Health within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_018",
  },
  quiz_019: {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to respiratory emergencies including bronchiolitis and croup.",
    mappingKey: "notebook:quiz_019",
  },
  quiz_020: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to specialist paediatric sleep medicine content.",
    mappingKey: "notebook:quiz_020",
  },
  quiz_021: {
    curriculum: "General Paediatrics",
    reason: "Mapped to common paediatric sleep and parasomnia content.",
    mappingKey: "notebook:quiz_021",
  },
  quiz_022: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Neck Lumps within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_022",
  },
  quiz_023: {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped to Indigenous Health within the community-based branch.",
    mappingKey: "notebook:quiz_023",
  },
  quiz_024: {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped to Indigenous Health within the community-based branch.",
    mappingKey: "notebook:quiz_024",
  },
  quiz_025: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to gastroenterology and hepatobiliary paediatrics within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_025",
  },
  quiz_026: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Gastroenterology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_026",
  },
  quiz_027: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Infectious Disease and Immunization via immunology content.",
    mappingKey: "notebook:quiz_027",
  },
  quiz_028: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to immunization and adverse-event content within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_028",
  },
  quiz_029: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Infectious Disease and Immunization.",
    mappingKey: "notebook:quiz_029",
  },
  quiz_030: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Adverse Food Reaction within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_030",
  },
  quiz_031: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Adverse Food Reaction and allergy within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_031",
  },
  quiz_032: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Adverse Food Reaction and allergy within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_032",
  },
  quiz_033: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Adverse Food Reaction and allergy within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_033",
  },
  quiz_034: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Infectious Disease and Immunization via immunology content.",
    mappingKey: "notebook:quiz_034",
  },
  quiz_035: {
    curriculum: "General Paediatrics",
    reason: "Mapped to core neonatal and early-life paediatric medicine content.",
    mappingKey: "notebook:quiz_035",
  },
  quiz_036: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Ophthalmology in Children within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_036",
  },
  quiz_037: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Ophthalmology in Children within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_037",
  },
  quiz_038: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Ophthalmology in Children within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_038",
  },
  quiz_039: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Ophthalmology in Children within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_039",
  },
  quiz_040: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Pain Management within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_040",
  },
  quiz_041: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Procedural Support and Pain Management within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_041",
  },
  quiz_042: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Renal Medicine in Children within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_042",
  },
  quiz_043: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Renal Medicine in Children within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_043",
  },
  quiz_044: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Renal Medicine in Children within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_044",
  },
  quiz_045: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Renal Medicine in Children within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_045",
  },
  quiz_046: {
    curriculum: "General Paediatrics",
    reason: "Mapped to Paediatric Procedural Skills and Medical Imaging.",
    mappingKey: "notebook:quiz_046",
  },
  quiz_047: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to surgical abdominal pain and acute abdominal assessment within Paediatric Surgery.",
    mappingKey: "notebook:quiz_047",
  },
  quiz_048: {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to gastrointestinal and surgical emergencies presenting with vomiting.",
    mappingKey: "notebook:quiz_048",
  },
  quiz_049: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Paediatric Cardiology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_049",
  },
  quiz_050: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Paediatric Cardiology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_050",
  },
  quiz_051: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Paediatric Cardiology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_051",
  },
  quiz_052: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Paediatric Cardiology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_052",
  },
  quiz_053: {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped to ADHD within Community/Developmental Paediatrics.",
    mappingKey: "notebook:quiz_053",
  },
  quiz_054: {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped to Autism Spectrum Disorder within Community/Developmental Paediatrics.",
    mappingKey: "notebook:quiz_054",
  },
  quiz_055: {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped to developmental surveillance and assessment within Community/Developmental Paediatrics.",
    mappingKey: "notebook:quiz_055",
  },
  quiz_056: {
    curriculum: "Community-based Paediatrics",
    reason: "Mapped to developmental surveillance and assessment within Community/Developmental Paediatrics.",
    mappingKey: "notebook:quiz_056",
  },
  quiz_057: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Dermatology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_057",
  },
  quiz_058: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Dermatology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_058",
  },
  quiz_059: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Pediatric Dermatology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_059",
  },
  quiz_060: {
    curriculum: "Adolescent Medicine",
    reason: "Mapped to puberty and maturation within Adolescent Health.",
    mappingKey: "notebook:quiz_060",
  },
  quiz_061: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to Genetics and Dysmorphology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_061",
  },
  quiz_062: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to haematology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_062",
  },
  quiz_063: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to haematology and bleeding disorders within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_063",
  },
  quiz_064: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to haematology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_064",
  },
  quiz_065: {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to seizure and collapse assessment in acute paediatric presentations.",
    mappingKey: "notebook:quiz_065",
  },
  quiz_066: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to neurology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_066",
  },
  quiz_067: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to neurology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_067",
  },
  quiz_068: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to neuromuscular medicine within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_068",
  },
  quiz_069: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to neurology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_069",
  },
  quiz_070: {
    curriculum: "General Paediatrics",
    reason: "Mapped to general paediatric growth and developmental assessment content.",
    mappingKey: "notebook:quiz_070",
  },
  quiz_071: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to neurology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_071",
  },
  quiz_072: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to oncology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_072",
  },
  quiz_073: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to congenital defects and neonatal surgical pathology within Paediatric Surgery.",
    mappingKey: "notebook:quiz_073",
  },
  quiz_074: {
    curriculum: "Adolescent Medicine",
    reason: "Mapped directly to Adolescent Health.",
    mappingKey: "notebook:quiz_074",
  },
  quiz_075: {
    curriculum: "Adolescent Medicine",
    reason: "Mapped to substance use and risk in Adolescent Health.",
    mappingKey: "notebook:quiz_075",
  },
  quiz_076: {
    curriculum: "Adolescent Medicine",
    reason: "Mapped to sexual health within Adolescent Health.",
    mappingKey: "notebook:quiz_076",
  },
  quiz_077: {
    curriculum: "Adolescent Medicine",
    reason: "Mapped to sexual health within Adolescent Health.",
    mappingKey: "notebook:quiz_077",
  },
  quiz_078: {
    curriculum: "Adolescent Medicine",
    reason: "Mapped directly to Adolescent Health.",
    mappingKey: "notebook:quiz_078",
  },
  quiz_079: {
    curriculum: "Adolescent Medicine",
    reason: "Mapped to chronic illness and transition themes within Adolescent Health.",
    mappingKey: "notebook:quiz_079",
  },
  quiz_080: {
    curriculum: "Adolescent Medicine",
    reason: "Mapped to adolescent sleep and delayed sleep phase content within Adolescent Health.",
    mappingKey: "notebook:quiz_080",
  },
  quiz_081: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to oral and maxillofacial/dental surgical pathology in children.",
    mappingKey: "notebook:quiz_081",
  },
  quiz_082: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to oral and maxillofacial/dental pathology in children.",
    mappingKey: "notebook:quiz_082",
  },
  quiz_083: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to oral and maxillofacial/dental pathology in children.",
    mappingKey: "notebook:quiz_083",
  },
  quiz_084: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to dental trauma within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_084",
  },
  quiz_085: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to oral and maxillofacial/dental pathology in children.",
    mappingKey: "notebook:quiz_085",
  },
  quiz_086: {
    curriculum: "Emergency Paediatrics",
    reason: "Mapped to paediatric resuscitation and emergency airway/breathing assessment.",
    mappingKey: "notebook:quiz_086",
  },
  quiz_087: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to orthopaedics and trauma within Paediatric Surgery.",
    mappingKey: "notebook:quiz_087",
  },
  quiz_088: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to orthopaedics and trauma within Paediatric Surgery.",
    mappingKey: "notebook:quiz_088",
  },
  quiz_089: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to fracture and growth-plate orthopaedic content within Paediatric Surgery.",
    mappingKey: "notebook:quiz_089",
  },
  quiz_090: {
    curriculum: "General Paediatrics",
    reason: "Mapped to growth and nutrition, including obesity, within General Paediatrics.",
    mappingKey: "notebook:quiz_090",
  },
  quiz_091: {
    curriculum: "General Paediatrics",
    reason: "Mapped to growth and nutrition, including obesity, within General Paediatrics.",
    mappingKey: "notebook:quiz_091",
  },
  quiz_092: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to orthopaedics within Paediatric Surgery.",
    mappingKey: "notebook:quiz_092",
  },
  quiz_093: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to orthopaedics within Paediatric Surgery.",
    mappingKey: "notebook:quiz_093",
  },
  quiz_094: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to orthopaedics within Paediatric Surgery.",
    mappingKey: "notebook:quiz_094",
  },
  quiz_095: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to orthopaedics within Paediatric Surgery.",
    mappingKey: "notebook:quiz_095",
  },
  quiz_096: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to paediatric rheumatology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_096",
  },
  quiz_097: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to paediatric rheumatology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_097",
  },
  quiz_098: {
    curriculum: "Paediatric Sub-specialties",
    reason: "Mapped to paediatric rheumatology within Paediatric Sub-specialties.",
    mappingKey: "notebook:quiz_098",
  },
  quiz_099: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Burns Management within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_099",
  },
  quiz_100: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Burns Management within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_100",
  },
  quiz_101: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Burns Management within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_101",
  },
  quiz_102: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Inguino-Scrotal and Penile pathology within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_102",
  },
  quiz_103: {
    curriculum: "Paediatric Surgery",
    reason: "Mapped to Inguino-Scrotal and Penile pathology within the Paediatric Surgery and Trauma branch.",
    mappingKey: "notebook:quiz_103",
  },
}

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

function curriculumAuditTag(curriculum: Curriculum) {
  return normalizeTagSlug(`combined-import/curriculum/${curriculum}`)
}

function upsertTags(tags: string[], curriculum: Curriculum) {
  const next = new Set(tags)
  next.add(curriculumAuditTag(curriculum))
  return Array.from(next).sort((left, right) => left.localeCompare(right))
}

function resolveDecision(question: Question) {
  const source = (question.source ?? {}) as Record<string, unknown>
  const sourceSystem = typeof source.sourceSystem === "string" ? source.sourceSystem : null
  const quizTitle = typeof source.quizTitle === "string" ? source.quizTitle : null
  const sourceQuizIdentifier = typeof source.sourceQuizIdentifier === "string" ? source.sourceQuizIdentifier : null

  if (sourceSystem === "canvas" && quizTitle) {
    const decision = canvasCurriculumByTitle[quizTitle]
    if (decision) return decision
  }

  if (sourceSystem === "notebooklm" && sourceQuizIdentifier) {
    const decision = notebookCurriculumByQuizId[sourceQuizIdentifier]
    if (decision) return decision
  }

  throw new Error(
    `No curriculum mapping found for imported question ${question.id} (sourceSystem=${sourceSystem} quizTitle=${quizTitle} quizId=${sourceQuizIdentifier})`,
  )
}

async function main() {
  const manifest = await readJson<ImportManifest>(manifestPath)
  const taggedAt = new Date().toISOString()
  const curriculumCounts = new Map<Curriculum, number>()

  for (const id of manifest.ids) {
    const filePath = path.join(draftsDir, `${id}.json`)
    const raw = await readJson<unknown>(filePath)
    const question = questionSchema.parse(raw)
    const decision = resolveDecision(question)
    const source = (question.source ?? {}) as Record<string, unknown>

    const updated = questionSchema.parse({
      ...question,
      curriculum: decision.curriculum,
      tags: upsertTags(question.tags, decision.curriculum),
      source: {
        ...source,
        curriculumTagging: {
          method: taggingMethod,
          taggedAt,
          selectedCurriculum: decision.curriculum,
          reason: decision.reason,
          mappingKey: decision.mappingKey,
          mindmapPath,
        },
      },
    })

    await fs.writeFile(filePath, `${toJson(updated)}\n`, "utf8")
    curriculumCounts.set(decision.curriculum, (curriculumCounts.get(decision.curriculum) ?? 0) + 1)
  }

  console.log(
    JSON.stringify(
      {
        taggedCount: manifest.ids.length,
        curriculumCounts: Object.fromEntries(
          Array.from(curriculumCounts.entries()).sort((left, right) => left[0].localeCompare(right[0])),
        ),
        taggingMethod,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
