import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { parseNeisFile } from '../src/domain/neisImport.ts';
import { buildSubjectTables } from '../src/domain/baseData.ts';
import { buildTakers, buildStudents } from '../src/domain/subjects.ts';
import { recommendIdealTimetable } from '../src/domain/recommendTimetable.ts';
import { createInitialTimes } from '../src/domain/constants.ts';

const files = [
  'C:\\Users\\pc\\Desktop\\안티그래비티 결과\\시험 시간표 소스\\학생편성현황(2026학년도  2학기  2)이름삭제.xlsx',
  'C:\\Users\\pc\\Desktop\\안티그래비티 결과\\시험 시간표 소스\\학생편성현황(2026학년도  2학기  3)이름삭제.xlsx'
];

for (const file of files) {
  console.log(`\n========================================`);
  console.log(`Testing with file: ${path.basename(file)}`);
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const { rows } = parseNeisFile(wb);
  const { subjectSummary } = buildSubjectTables(rows, 1);
  const takers = buildTakers(rows, subjectSummary);
  const students = buildStudents(rows, subjectSummary);

  console.log(`Students: ${students.length}, Subjects: ${subjectSummary.length}`);

  // Test 3 days, 4 days, 5 days with 3 periods each
  for (const dayCount of [3, 4, 5]) {
    const activeDays = Array.from({ length: dayCount }, (_, i) => i + 1);
    const times = createInitialTimes();
    for (const t of times) {
      if (t.period <= 3 && t.day <= dayCount) {
        t.time = `09:00 ~ 10:00`;
      } else {
        t.time = null;
      }
    }

    const res = recommendIdealTimetable(subjectSummary, takers, students, activeDays, times);
    console.log(`\n[${dayCount}일간 / 하루 3교시]`);
    console.log(`Placed: ${res.placedCount}/${subjectSummary.length}`);
    console.log(`Unplaced count: ${res.unplacedSubjects.length} ->`, res.unplacedSubjects);
    console.log(`Max daily exams for any student: ${res.maxDailyExamsForAnyStudent}`);
    console.log(`Period 3 coverage: ${res.period3CoverageAvg}%`);
    console.log(`Period 2 self study days: ${res.period2SelfStudyDays.length}`);
  }
}
