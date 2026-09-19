import * as XLSX from 'xlsx';
import { NeisRow } from '../../src/domain/types';

export function makeNeisRows(opts: { pad?: boolean; includeInvalid?: boolean } = {}): NeisRow[] {
  const rows: NeisRow[] = [];
  const banCount = opts.pad === false ? 9 : 12;

  for (let b = 1; b <= banCount; b++) {
    const banStr = `${b}반`;
    for (let num = 1; num <= 25; num++) {
      const name = `학생${String((b - 1) * 25 + num).padStart(3, '0')}`;

      // 국어, 수학, 사회 (12분반 7차일반 b)
      rows.push({
        year: '2026',
        semester: '2',
        grade: '1',
        curriculum: '일반',
        subject: '공통국어2(4)',
        room: `7차일반 ${b}`,
        track: '보통과/1학년/',
        ban: banStr,
        num,
        name,
        room2: `7차일반 ${b}`,
      });

      rows.push({
        year: '2026',
        semester: '2',
        grade: '1',
        curriculum: '일반',
        subject: '공통수학2(4)',
        room: `7차일반 ${b}`,
        track: '보통과/1학년/',
        ban: banStr,
        num,
        name,
        room2: `7차일반 ${b}`,
      });

      rows.push({
        year: '2026',
        semester: '2',
        grade: '1',
        curriculum: '일반',
        subject: '통합사회2(3)',
        room: `7차일반 ${b}`,
        track: '보통과/1학년/',
        ban: banStr,
        num,
        name,
        room2: `7차일반 ${b}`,
      });

      // 한국사(홀수) / 정보(짝수)
      if (num % 2 === 1) {
        const subGroup = ((b - 1) % 6) + 1;
        rows.push({
          year: '2026',
          semester: '2',
          grade: '1',
          curriculum: '일반',
          subject: '한국사(3)',
          room: `이동수업 ${String.fromCharCode(64 + subGroup)}`,
          track: '보통과/1학년/',
          ban: banStr,
          num,
          name,
          room2: `이동수업 ${String.fromCharCode(64 + subGroup)}`,
        });
      } else {
        const subGroup = ((b - 1) % 6) + 1;
        rows.push({
          year: '2026',
          semester: '2',
          grade: '1',
          curriculum: '일반',
          subject: '정보(2)',
          room: `컴퓨터실 ${subGroup}`,
          track: '보통과/1학년/',
          ban: banStr,
          num,
          name,
          room2: `컴퓨터실 ${subGroup}`,
        });
      }

      // 음악: 1~8반 전원
      if (b <= 8) {
        const subGroup = ((b - 1) % 4) + 1;
        rows.push({
          year: '2026',
          semester: '2',
          grade: '1',
          curriculum: '일반',
          subject: '음악(1)',
          room: `음악실 ${subGroup}`,
          track: '보통과/1학년/',
          ban: banStr,
          num,
          name,
          room2: `음악실 ${subGroup}`,
        });
      }

      // 미술: 9~12반 전원 + 1~8반 중 번호 1~5
      if (b >= 9 || num <= 5) {
        const subGroup = ((b - 1) % 4) + 1;
        rows.push({
          year: '2026',
          semester: '2',
          grade: '1',
          curriculum: '일반',
          subject: '미술(1)',
          room: `미술실 ${subGroup}`,
          track: '보통과/1학년/',
          ban: banStr,
          num,
          name,
          room2: `미술실 ${subGroup}`,
        });
      }
    }
  }

  // 위탁학생 2명
  for (let num = 1; num <= 2; num++) {
    const name = `위탁학생${num}`;
    rows.push({
      year: '2026',
      semester: '2',
      grade: '1',
      curriculum: '일반',
      subject: '공통국어2(4)',
      room: '7차일반 1',
      track: '보통과/1학년/',
      ban: '위탁1반',
      num,
      name,
      room2: '7차일반 1',
    });
    rows.push({
      year: '2026',
      semester: '2',
      grade: '1',
      curriculum: '일반',
      subject: '공통수학2(4)',
      room: '7차일반 1',
      track: '보통과/1학년/',
      ban: '위탁1반',
      num,
      name,
      room2: '7차일반 1',
    });
  }

  if (opts.includeInvalid) {
    rows.push({
      year: '2026',
      semester: '2',
      grade: '1',
      curriculum: '일반',
      subject: '공통국어2(4)',
      room: '7차일반 1',
      track: '보통과/1학년/',
      ban: '05반',
      num: 26,
      name: '(미재학) 학생999',
      room2: '7차일반 1',
    });
    rows.push({
      year: '2026',
      semester: '2',
      grade: '1',
      curriculum: '일반',
      subject: '공통국어2(4)',
      room: '7차일반 1',
      track: '보통과/1학년/',
      ban: '05반',
      num: 27,
      name: '',
      room2: '7차일반 1',
    });
  }

  return rows.sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0));
}

export function makeNeisWorkbook(rows: NeisRow[]): Uint8Array {
  const wsData: any[][] = [];
  // Dummy rows 1 to 4
  wsData.push(['부산광역시교육청 학생편성현황']);
  wsData.push(['조회일자: 2026-09-04']);
  wsData.push([]);
  wsData.push([]);
  // Row 5 header starting at Col C (col index 2)
  wsData.push([
    '',
    '',
    '학년도',
    '학기',
    '학년',
    '편제명',
    '개설과목(단위수)',
    '개설강의실',
    '계열/학년/학과',
    '반',
    '번호',
    '성명',
  ]);

  for (const r of rows) {
    wsData.push([
      '',
      '',
      r.year,
      r.semester,
      r.grade,
      r.curriculum,
      r.subject,
      r.room,
      r.track,
      r.ban,
      r.num,
      r.name,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '학생편성현황');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
