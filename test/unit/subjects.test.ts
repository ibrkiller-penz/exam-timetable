import { describe, it, expect } from 'vitest';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisRows, makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables } from '../../src/domain/baseData';
import { buildTakers, findCompatGroups, buildStudents } from '../../src/domain/subjects';

describe('subjects', () => {
  it('finds compat groups for non-intersecting subjects', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary } = buildSubjectTables(rows, 1);
    const evalSubjects = subjectSummary.filter(s =>
      ['공통국어2(4)', '공통수학2(4)', '한국사(3)', '정보(2)'].includes(s.subject)
    );
    const takers = buildTakers(rows, evalSubjects);
    const { groups } = findCompatGroups(evalSubjects, takers, 302);

    expect(groups.some(g => g.subjects.includes('한국사(3)') && g.subjects.includes('정보(2)'))).toBe(true);
    expect(groups.some(g => g.subjects.includes('공통국어2(4)') && g.subjects.includes('공통수학2(4)'))).toBe(false);
  });

  it('builds student list correctly', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary } = buildSubjectTables(rows, 1);
    const students = buildStudents(rows, subjectSummary);
    expect(students.length).toBe(302);
  });
});
