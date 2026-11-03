export interface Course {
  code: string;
  name: string;
}

// 每个“科目 + 等级”是一个独立选项，既用于选课，也用于公共任务的可见范围
export const COURSES: Course[] = [
  { code: 'CHN_A_LIT_SL', name: '中文A文学 SL' },
  { code: 'CHN_A_LIT_HL', name: '中文A文学 HL' },
  { code: 'CHN_A_LANGLIT_SL', name: '中文A语言与文学 SL' },
  { code: 'MATH_SL', name: '数学 SL' },
  { code: 'MATH_HL', name: '数学 HL' },
  { code: 'ENG_B_SL', name: '英语B SL' },
  { code: 'ENG_B_HL', name: '英语B HL' },
  { code: 'ENG_A_LANGLIT_SL', name: '英语A语言与文学 SL' },
  { code: 'PHYS_SL', name: '物理 SL' },
  { code: 'PHYS_HL', name: '物理 HL' },
  { code: 'CHEM_SL', name: '化学 SL' },
  { code: 'CHEM_HL', name: '化学 HL' },
  { code: 'BIO_SL', name: '生物 SL' },
  { code: 'BIO_HL', name: '生物 HL' },
  { code: 'ECON_SL', name: '经济 SL' },
  { code: 'ECON_HL', name: '经济 HL' },
  { code: 'BM_SL', name: 'BM SL' },
  { code: 'BM_HL', name: 'BM HL' },
  { code: 'HIST_SL', name: '历史 SL' },
  { code: 'HIST_HL', name: '历史 HL' },
  { code: 'GERMAN', name: '德语' },
  { code: 'FRENCH', name: '法语' },
];

const byCode = new Map(COURSES.map((c) => [c.code, c.name]));

export function courseName(code: string): string {
  return byCode.get(code) ?? code;
}
