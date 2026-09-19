import { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots } from '../../store/selectors';
import { applySeparate } from '../../domain/separate';

/**
 * 인쇄물이 쓸 응시현황.
 *
 * 저장된 응시현황에 별도 고사실 지정을 입혀서 돌려줍니다.
 * 인쇄물마다 따로 챙기면 어느 하나는 꼭 빠지므로, 여기 한 곳을 거치게 합니다.
 */
export function useAttendance() {
  const attendance = useAppStore(s => s.attendance);
  const separateExaminers = useAppStore(s => s.separateExaminers);
  const slots = useAppStore(selPlacementSlots);
  const allDay = useAppStore(s => s.settings.separateRoomAllDay ?? false);

  return useMemo(
    () => applySeparate(attendance, slots, separateExaminers, allDay),
    [attendance, slots, separateExaminers, allDay]
  );
}
