// Suggested study topics per subject. Matched loosely against the subject name;
// falls back to generic study topics so every subject gets useful suggestions.
const TOPIC_MAP: { match: string[]; topics: string[] }[] = [
  { match: ['english', 'lang', 'literature'], topics: ['Writing', 'Reading', 'Grammar', 'Literature', 'Vocabulary', 'Essay'] },
  { match: ['math', 'calc', 'algebra'], topics: ['Algebra', 'Geometry', 'Calculus', 'Trigonometry', 'Statistics', 'Problem Solving'] },
  { match: ['history'], topics: ['Essay', 'Sources', 'Timeline', 'Revision', 'Key Dates', 'Case Study'] },
  { match: ['bio'], topics: ['Cells', 'Genetics', 'Ecology', 'Anatomy', 'Diagrams', 'Definitions'] },
  { match: ['chem'], topics: ['Bonding', 'Reactions', 'Equations', 'Organic', 'Periodic Table', 'Practice'] },
  { match: ['phys'], topics: ['Mechanics', 'Electricity', 'Waves', 'Equations', 'Practicals', 'Problem Solving'] },
  { match: ['geog'], topics: ['Maps', 'Case Study', 'Fieldwork', 'Definitions', 'Diagrams', 'Revision'] },
  { match: ['econ', 'business'], topics: ['Definitions', 'Diagrams', 'Case Study', 'Essay', 'Calculations', 'Revision'] },
  { match: ['comp', 'cs', 'coding', 'program'], topics: ['Theory', 'Coding', 'Algorithms', 'Practice', 'Project', 'Revision'] },
  { match: ['art', 'design'], topics: ['Sketching', 'Project', 'Techniques', 'Research', 'Portfolio'] },
  { match: ['music'], topics: ['Practice', 'Theory', 'Composition', 'Listening', 'Performance'] },
  { match: ['span', 'french', 'german', 'chinese', 'latin'], topics: ['Vocabulary', 'Grammar', 'Speaking', 'Listening', 'Writing', 'Reading'] },
];

const GENERIC = ['Revision', 'Practice', 'New Material', 'Homework', 'Notes', 'Reading'];

export function suggestedTopics(subject: string): string[] {
  const key = subject.toLowerCase();
  for (const entry of TOPIC_MAP) {
    if (entry.match.some((m) => key.includes(m))) return entry.topics;
  }
  return GENERIC;
}
