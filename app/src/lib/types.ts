export type QuestionOption = {
  key: string;
  text: string;
};

export type QuestionSource = {
  file?: string;
  originalQNumber?: string;
  sectionTitle?: string;
  emqSetTitle?: string;
  stemHash?: string;
  parseNotes?: string[];
};
