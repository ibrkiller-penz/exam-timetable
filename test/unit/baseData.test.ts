import { describe, it, expect } from 'vitest';
import { makeNeisRows } from '../fixtures/makeNeisFixture';
import { parseNeisFile } from '../../src/domain/neisImport';
import { makeNeisWorkbook } from '../fixtures/makeNeisFixture';
import { buildSubjectTables, buildRooms, moveToConvenience } from '../../src/domain/baseData';
import { vbaVal } from '../../src/domain/util/vbaVal';

describe('baseData', () => {
  it('correctly calculates vbaVal', () => {
    expect(vbaVal('01반')).toBe(1);
    expect(vbaVal('편의반')).toBe(0);
    expect(vbaVal(' 12반')).toBe(12);
    expect(vbaVal('3.5x')).toBe(3.5);
  });

  it('builds subject tables and rooms', () => {
    const rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 1);
    expect(subjectSummary.length).toBeGreaterThan(5);

    const rooms = buildRooms(rows, subjectSummary, subjectBans);
    expect(rooms.some(r => r.roomName === '별도실1')).toBe(true);
    expect(rooms.some(r => r.banName === '01반')).toBe(true);
    expect(rooms.some(r => r.banName === '위탁학생')).toBe(true);
  });

  it('handles convenience class move', () => {
    let rows = parseNeisFile(makeNeisWorkbook(makeNeisRows())).rows;
    rows = moveToConvenience(rows, '03반', 7);
    const { subjectSummary, subjectBans } = buildSubjectTables(rows, 2);
    expect(subjectBans.some(b => b.room === '편의반')).toBe(true);
  });
});
