import Foundation

struct CAHBlueprintTopic: Equatable, Sendable {
    let slug: String
    let name: String
    let aliases: [String]
}

struct CAHBlueprintCategory: Equatable, Sendable {
    let slug: String
    let name: String
    let examQuestionCount: Int
    let examPercent: Double
    let aliases: [String]
    let subtopics: [CAHBlueprintTopic]
}

enum CAHBlueprint {
    static let categories: [CAHBlueprintCategory] = [
        .init(
            slug: "general-paediatrics",
            name: "General Paediatrics",
            examQuestionCount: 16,
            examPercent: 26.7,
            aliases: ["general paediatrics", "growth", "development", "nutrition", "well child"],
            subtopics: [
                .init(slug: "general-paediatrics/growth-and-nutrition", name: "Growth and Nutrition", aliases: ["growth", "nutrition", "feeding", "weight faltering", "growth chart", "vitamin d", "obesity"]),
                .init(slug: "general-paediatrics/child-development", name: "Child Development", aliases: ["development", "milestone", "red flag", "speech delay", "gross motor", "fine motor"]),
                .init(slug: "general-paediatrics/common-clinical-conditions", name: "Common Clinical Conditions", aliases: ["constipation", "fever", "rash", "eczema", "anaemia", "sleep", "enuresis"]),
            ]
        ),
        .init(
            slug: "paediatric-sub-specialties",
            name: "Paediatric Sub-specialties",
            examQuestionCount: 12,
            examPercent: 20,
            aliases: ["paediatric sub specialties", "subspecialty", "specialty", "ent", "respiratory", "gastroenterology"],
            subtopics: [
                .init(slug: "paediatric-sub-specialties/ent", name: "ENT", aliases: ["ent", "ear", "otitis", "hearing", "nose", "epistaxis", "tonsillitis", "throat", "sinusitis"]),
                .init(slug: "paediatric-sub-specialties/chronic-respiratory-problems", name: "Chronic Respiratory Problems", aliases: ["asthma", "cystic fibrosis", "sleep disordered breathing", "chronic respiratory", "wheeze"]),
                .init(slug: "paediatric-sub-specialties/allergy", name: "Allergy", aliases: ["allergy", "anaphylaxis", "ige", "non ige", "cow milk protein", "food allergy"]),
                .init(slug: "paediatric-sub-specialties/immunology-and-infection", name: "Immunology and Infection", aliases: ["immunology", "infection", "meningococcal", "viral exanthem", "sepsis", "immunodeficiency"]),
                .init(slug: "paediatric-sub-specialties/gastroenterology", name: "Gastroenterology", aliases: ["gastroenterology", "malabsorption", "coeliac", "inflammatory bowel", "jaundice", "liver failure"]),
                .init(slug: "paediatric-sub-specialties/ophthalmology", name: "Ophthalmology", aliases: ["ophthalmology", "conjunctivitis", "keratoconjunctivitis", "eye", "vision"]),
                .init(slug: "paediatric-sub-specialties/neonatology", name: "Neonatology", aliases: ["neonatal", "newborn", "prematurity", "resuscitation of the newborn"]),
                .init(slug: "paediatric-sub-specialties/other-specialty-systems", name: "Other Specialty Systems", aliases: ["cardiology", "renal", "endocrine", "neurology", "haematology", "oncology", "rheumatology"]),
            ]
        ),
        .init(
            slug: "paediatric-surgery",
            name: "Paediatric Surgery",
            examQuestionCount: 10,
            examPercent: 16.7,
            aliases: ["paediatric surgery", "surgery", "surgical"],
            subtopics: [
                .init(slug: "paediatric-surgery/surgical-abdomen", name: "Surgical Abdomen", aliases: ["appendicitis", "acute abdomen", "intussusception", "pyloric stenosis", "bowel obstruction"]),
                .init(slug: "paediatric-surgery/orthopaedics", name: "Orthopaedics", aliases: ["orthopaedic", "fracture", "limp", "hip", "bone", "clubfoot"]),
                .init(slug: "paediatric-surgery/urology-and-inguinoscrotal", name: "Urology and Inguinoscrotal", aliases: ["urology", "testicular", "inguinal", "hernia", "undescended", "scrotal", "torsion"]),
                .init(slug: "paediatric-surgery/burns-and-trauma", name: "Burns and Trauma", aliases: ["burn", "trauma", "head injury", "wound"]),
                .init(slug: "paediatric-surgery/congenital-surgical-problems", name: "Congenital Surgical Problems", aliases: ["atresia", "hirschsprung", "congenital surgical", "cleft", "malrotation"]),
            ]
        ),
        .init(
            slug: "emergency-paediatrics",
            name: "Emergency Paediatrics",
            examQuestionCount: 10,
            examPercent: 16.7,
            aliases: ["emergency paediatrics", "acute", "resuscitation", "shock"],
            subtopics: [
                .init(slug: "emergency-paediatrics/acute-respiratory-problems", name: "Acute Respiratory Problems", aliases: ["croup", "epiglottitis", "bronchiolitis", "pneumonia", "respiratory distress", "stridor"]),
                .init(slug: "emergency-paediatrics/resuscitation", name: "Resuscitation", aliases: ["resuscitation", "basic life support", "advanced life support", "arrest"]),
                .init(slug: "emergency-paediatrics/sepsis", name: "Sepsis", aliases: ["sepsis", "septic", "meningitis", "meningococcal"]),
                .init(slug: "emergency-paediatrics/dehydration-and-shock", name: "Dehydration and Shock", aliases: ["dehydration", "shock", "fluid bolus", "hypovolaemia"]),
                .init(slug: "emergency-paediatrics/trauma-burns-seizures-and-poisoning", name: "Trauma, Burns, Seizures and Poisoning", aliases: ["trauma", "burn", "seizure", "poison", "ingestion", "overdose"]),
                .init(slug: "emergency-paediatrics/acute-abdomen", name: "Acute Abdomen", aliases: ["acute abdomen", "abdominal pain", "appendicitis", "intussusception"]),
            ]
        ),
        .init(
            slug: "adolescent-medicine",
            name: "Adolescent Medicine",
            examQuestionCount: 6,
            examPercent: 10,
            aliases: ["adolescent", "teenager", "youth"],
            subtopics: [
                .init(slug: "adolescent-medicine/mental-health", name: "Mental Health", aliases: ["mental health", "depression", "anxiety", "self harm", "suicide"]),
                .init(slug: "adolescent-medicine/sexual-health-and-puberty", name: "Sexual Health and Puberty", aliases: ["sexual health", "puberty", "contraception", "pregnancy", "menstrual"]),
                .init(slug: "adolescent-medicine/eating-disorders-and-substance-use", name: "Eating Disorders and Substance Use", aliases: ["eating disorder", "anorexia", "bulimia", "substance", "alcohol", "vaping"]),
                .init(slug: "adolescent-medicine/transition-and-confidentiality", name: "Transition and Confidentiality", aliases: ["transition", "confidentiality", "consent", "headsss", "independence"]),
            ]
        ),
        .init(
            slug: "community-based-paediatrics",
            name: "Community-based Paediatrics",
            examQuestionCount: 6,
            examPercent: 10,
            aliases: ["community based paediatrics", "population health", "prevention"],
            subtopics: [
                .init(slug: "community-based-paediatrics/immunisation", name: "Immunisation", aliases: ["immunisation", "immunization", "vaccine", "vaccination", "aefi", "nip schedule"]),
                .init(slug: "community-based-paediatrics/aboriginal-health", name: "Aboriginal Health", aliases: ["aboriginal", "torres strait", "first nations", "cultural safety"]),
                .init(slug: "community-based-paediatrics/population-health-and-prevention", name: "Population Health and Prevention", aliases: ["population health", "screening", "prevention", "public health", "injury prevention"]),
                .init(slug: "community-based-paediatrics/disability-and-developmental-support", name: "Disability and Developmental Support", aliases: ["disability", "ndis", "autism", "cerebral palsy", "developmental support"]),
                .init(slug: "community-based-paediatrics/evidence-based-medicine", name: "Evidence-based Medicine", aliases: ["evidence based", "sensitivity", "specificity", "relative risk", "odds ratio", "number needed"]),
            ]
        ),
    ]

    static var allSlugs: [String] {
        categories.flatMap { [$0.slug] + $0.subtopics.map(\.slug) }
    }

    static func isBlueprintSlug(_ slug: String) -> Bool {
        allSlugs.contains(slug)
    }

    static func descriptors() -> [TagDescriptor] {
        categories.flatMap { category in
            [
                TagDescriptor(slug: category.slug, name: category.name, kind: .curriculum, parentSlug: nil),
            ] + category.subtopics.map { topic in
                TagDescriptor(slug: topic.slug, name: topic.name, kind: .topic, parentSlug: category.slug)
            }
        }
    }

    static func projectedSlugs(for question: QuestionFile) -> [String] {
        let haystack = normalized(
            ([question.curriculum.rawValue, question.stem, question.explanation ?? "", question.rationale ?? "", question.moduleCode ?? ""] + question.tags)
                .joined(separator: " ")
        )
        var slugs = Set<String>()
        if let curriculumSlug = curriculumSlug(for: question.curriculum), isBlueprintSlug(curriculumSlug) {
            slugs.insert(curriculumSlug)
        }

        for category in categories {
            if category.aliases.contains(where: { containsAlias(haystack: haystack, alias: $0) }) {
                slugs.insert(category.slug)
            }
            for topic in category.subtopics where topic.aliases.contains(where: { containsAlias(haystack: haystack, alias: $0) }) {
                slugs.insert(category.slug)
                slugs.insert(topic.slug)
            }
        }
        return slugs.sorted()
    }

    private static func curriculumSlug(for curriculum: Curriculum) -> String? {
        guard curriculum != .unclassified else { return nil }
        return normalizedSlug(curriculum.rawValue)
    }

    private static func normalized(_ value: String) -> String {
        value
            .lowercased()
            .replacingOccurrences(of: "&", with: " and ")
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func containsAlias(haystack: String, alias: String) -> Bool {
        let normalizedAlias = normalized(alias)
        guard !normalizedAlias.isEmpty else { return false }
        return " \(haystack) ".contains(" \(normalizedAlias) ")
    }

    private static func normalizedSlug(_ value: String) -> String {
        normalized(value)
            .replacingOccurrences(of: " ", with: "-")
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}
