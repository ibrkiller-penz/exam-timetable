import * as XLSX from 'xlsx';
import { AttendanceRow, LabelRow } from '../domain/types';

export function exportAttendanceToExcel(attendance: AttendanceRow[], filename = '응시현황.xlsx') {
  const headers = [
    'Key1', 'Key2', 'Key3', '일차', '교시', '고사실', '과목', '학년', '반', '번호', '성명', '강의실', '학번순', '좌석번호'
  ];

  const data = attendance.map(r => [
    r.key1, r.key2, r.key3, r.day, r.period, r.examRoom, r.subject, r.grade, r.ban, r.num, r.name, r.classRoom, r.seq, r.seat
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '응시현황');
  XLSX.writeFile(wb, filename);
}

export function exportLabelsToExcel(labels: LabelRow[], filename = '문제지라벨.xlsx') {
  const headers = ['연번', '일차', '교시', '날짜', '시간', '과목', '고사실', '응시분반', '응시인원'];
  const data = labels.map(l => [
    l.seq, l.day, l.period, l.date, l.time, l.subject, l.examRoom, l.classRoom, l.stuCount
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '라벨데이터');
  XLSX.writeFile(wb, filename);
}
export function exportMultipleDOMTablesToExcel(selector: string, filename = '��¹�.xlsx') {  
  const tables = document.querySelectorAll(selector);  
  if (!tables || tables.length === 0) return;  
  const wb = XLSX.utils.book_new();  
  let sheetCount = 1;  
  tables.forEach((table, idx) => {  
    let sheetName = `S${sheetCount++}`;  
    const header = table.parentElement?.querySelector('h1, h2, h3');  
    if (header && header.textContent) {  
      const clean = header.textContent.trim().substring(0, 25).replace(/[\/\?*\[\]\:]/g, '').trim();  
      if (clean) sheetName = clean;  
    }  
    const ws = XLSX.utils.table_to_sheet(table);  
    try { XLSX.utils.book_append_sheet(wb, ws, sheetName); } catch (e) { XLSX.utils.book_append_sheet(wb, ws, `S${sheetCount++}`); }  
  });  
  XLSX.writeFile(wb, filename);  
} 
