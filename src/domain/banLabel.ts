import { BanLabelStyle, SlotBanLabels, SlotBanLabelStyle, banLetter } from './types';

/**
 * 분반 이름을 어떻게 부를지 모아 둔 설정.
 * 화면(7·8단계)과 인쇄물이 같은 규칙을 쓰도록 이 한 곳에서 계산합니다.
 */
export interface BanLabelConfig {
  /** 설정의 기본 표기 방식. 없으면 가나다. */
  defaultStyle?: BanLabelStyle;
  /** 교시별 표기 방식 예외. */
  slotStyle?: SlotBanLabelStyle;
  /** 교시·고사실별로 직접 적은 이름. */
  manual?: SlotBanLabels;
}

/** 해당 교시에 적용되는 표기 방식. */
export function banStyleForSlot(slotIndex: number | undefined, cfg?: BanLabelConfig): BanLabelStyle {
  if (slotIndex !== undefined && cfg?.slotStyle?.[slotIndex]) return cfg.slotStyle[slotIndex];
  return cfg?.defaultStyle ?? 'ko';
}

/**
 * 분반 부분만 돌려줍니다 — '가반', 'A반', 직접 적은 'G1', 또는 표시 안 함일 때 ''.
 * banPart는 `1반` 처럼 저장된 원래 값입니다.
 */
export function banSuffix(
  banPart: string,
  slotIndex?: number,
  roomId?: string,
  cfg?: BanLabelConfig
): string {
  if (slotIndex !== undefined && roomId) {
    const manual = cfg?.manual?.[slotIndex]?.[roomId];
    if (manual) return manual;
  }

  const style = banStyleForSlot(slotIndex, cfg);
  if (style === 'none') return '';

  const m = banPart.match(/^(\d+)반$/);
  if (!m) return banPart; // 숫자 분반이 아니면 원래 값을 그대로 씁니다.

  const letter = banLetter(Number(m[1]), style);
  return letter ? `${letter}반` : '';
}

/**
 * `과목(4)-1반` 같은 셀 값을 화면·인쇄물에 쓸 이름으로 바꿉니다.
 * 저장 형식은 그대로 두고 표기만 바꾸는 것이 원칙입니다.
 */
export function formatBanCell(
  cellValue: string,
  slotIndex?: number,
  roomId?: string,
  cfg?: BanLabelConfig
): string {
  const hyphen = cellValue.lastIndexOf('-');
  if (hyphen === -1) return cellValue;

  const subject = cellValue.slice(0, hyphen);
  const suffix = banSuffix(cellValue.slice(hyphen + 1).trim(), slotIndex, roomId, cfg);
  return suffix ? `${subject}-${suffix}` : subject;
}
